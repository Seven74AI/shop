import { describe, expect, test, afterEach } from 'vitest'
import { prisma } from './db.server.ts'
import {
	nextInvoiceNumber,
	withInvoiceLock,
} from './invoice.server.ts'

afterEach(async () => {
	// Clean up in correct FK order: invoices first (they reference orders)
	await prisma.invoice.deleteMany({})
	await prisma.order.deleteMany({
		where: {
			OR: [
				{ orderNumber: { startsWith: 'ORD-CONC-' } },
				{ orderNumber: { startsWith: 'ORD-FY-' } },
				{ orderNumber: { startsWith: 'ORD-INV-TEST' } },
			],
		},
	})
})

/**
 * Helper: atomically generate number + create invoice within the lock.
 * Each invoice needs a unique order (orderId is @unique on Invoice).
 */
let _orderCounter = 0
async function reserveInvoice(fiscalYear: number) {
	return withInvoiceLock(async () => {
		_orderCounter++
		const orderNumber = `ORD-INV-TEST-${_orderCounter}`

		const order = await prisma.order.create({
			data: {
				orderNumber,
				email: `invtest${_orderCounter}@test.com`,
				subtotal: 0,
				total: 0,
				shippingName: 'Test',
				shippingStreet: 'Test',
				shippingCity: 'Test',
				shippingPostal: '00000',
				shippingCountry: 'XX',
				stripeCheckoutSessionId: `cs_inv_${_orderCounter}`,
			},
		})

		const number = await nextInvoiceNumber(fiscalYear)
		const seq = parseInt(number.split('-')[1]!, 10)
		await prisma.invoice.create({
			data: {
				orderId: order.id,
				number,
				fiscalYear,
				sequence: seq,
				totalCents: 0,
				vatCents: 0,
			},
		})
		return number
	})
}

describe('nextInvoiceNumber', () => {
	test('should generate invoice number in correct format', async () => {
		const number = await reserveInvoice(2026)
		expect(number).toMatch(/^\d{4}-\d{6}$/)
	})

	test('should return 2026-000001 for first invoice of fiscal year', async () => {
		const number = await reserveInvoice(2026)
		expect(number).toBe('2026-000001')
	})

	test('should generate sequential numbers within same fiscal year', async () => {
		const num1 = await reserveInvoice(2026)
		const num2 = await reserveInvoice(2026)
		const num3 = await reserveInvoice(2026)

		expect(num1).toBe('2026-000001')
		expect(num2).toBe('2026-000002')
		expect(num3).toBe('2026-000003')
	})

	test('should handle fiscal year rollover — nextInvoiceNumber(2027) after 2026 returns 2027-000001', async () => {
		const num2026_1 = await reserveInvoice(2026)
		expect(num2026_1).toBe('2026-000001')

		const num2026_2 = await reserveInvoice(2026)
		expect(num2026_2).toBe('2026-000002')

		// Now roll over to 2027
		const num2027 = await reserveInvoice(2027)
		expect(num2027).toBe('2027-000001')

		// 2026 should continue where it left off
		const num2026_3 = await reserveInvoice(2026)
		expect(num2026_3).toBe('2026-000003')
	})

	test(
		'nextInvoiceNumber is gapless under concurrency — 50 parallel calls produce 1..50 with no gaps and no duplicates',
		async () => {
			// 50 parallel calls, each creates its own order+invoice atomically
			const promises = Array.from({ length: 50 }, () =>
				reserveInvoice(2026),
			)
			const numbers = await Promise.all(promises)

			// All should be unique (no duplicates)
			const uniqueNumbers = new Set(numbers)
			expect(uniqueNumbers.size).toBe(50)

			// Extract sequences and sort
			const sequences = numbers.map((n) =>
				parseInt(n.split('-')[1]!, 10),
			)
			sequences.sort((a, b) => a - b)

			// Should be 1..50 with no gaps
			for (let i = 0; i < 50; i++) {
				expect(sequences[i]).toBe(i + 1)
			}

			// All should match format
			numbers.forEach((num) => {
				expect(num).toMatch(/^2026-\d{6}$/)
			})
		},
		30000,
	)

	test(
		'different fiscal years should not interfere with each other under concurrency',
		async () => {
			const promises2026 = Array.from({ length: 10 }, () =>
				reserveInvoice(2026),
			)
			const promises2027 = Array.from({ length: 10 }, () =>
				reserveInvoice(2027),
			)

			const [numbers2026, numbers2027] = await Promise.all([
				Promise.all(promises2026),
				Promise.all(promises2027),
			])

			// Each year should have unique numbers
			expect(new Set(numbers2026).size).toBe(10)
			expect(new Set(numbers2027).size).toBe(10)

			// Years should be independent — 2027 starts at 1 even when 2026 has activity
			const sequences2027 = numbers2027
				.map((n) => parseInt(n.split('-')[1]!, 10))
				.sort((a, b) => a - b)
			expect(sequences2027[0]).toBe(1)
			expect(sequences2027[9]).toBe(10)

			// 2026 sequences should also be sequential 1-10
			const sequences2026 = numbers2026
				.map((n) => parseInt(n.split('-')[1]!, 10))
				.sort((a, b) => a - b)
			for (let i = 0; i < 10; i++) {
				expect(sequences2026[i]).toBe(i + 1)
			}
		},
		30000,
	)
})
