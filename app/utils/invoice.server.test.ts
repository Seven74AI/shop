import { describe, expect, test, afterEach, beforeEach } from 'vitest'
import { prisma } from './db.server.ts'
import {
	generateInvoiceNumber,
	formatInvoiceNumber,
	parseInvoiceNumber,
	withInvoiceLock,
	getInvoicePdfData,
	getInvoicePdf,
} from './invoice.server.ts'
import { generateOrderNumber } from './order-number.server.ts'

/**
 * Creates a test order and returns it. Orders are required for Invoice FK.
 */
async function createTestOrder(
	id: string,
	overrides: Record<string, unknown> = {},
) {
	const orderNumber = await generateOrderNumber()
	return prisma.order.create({
		data: {
			id,
			orderNumber,
			email: 'test@example.com',
			subtotal: 1000,
			total: 1200,
			shippingName: 'Test User',
			shippingStreet: '123 Test St',
			shippingCity: 'Test City',
			shippingPostal: '12345',
			shippingCountry: 'US',
			stripeCheckoutSessionId: `cs_test_${id}`,
			...overrides,
		} as never,
	})
}

/**
 * Creates a test invoice linked to a given order.
 */
async function createTestInvoice(
	fiscalYear: number,
	sequence: number,
	orderId: string,
	overrides: Record<string, unknown> = {},
) {
	return prisma.invoice.create({
		data: {
			fiscalYear,
			sequence,
			kind: 'INVOICE',
			orderId,
			subtotalCents: 1000,
			totalCents: 1200,
			...overrides,
		} as never,
	})
}

afterEach(async () => {
	await prisma.invoice.deleteMany({})
	await prisma.orderItem.deleteMany({})
	await prisma.order.deleteMany({})
})

describe('formatInvoiceNumber', () => {
	test('should format fiscal year 2025 sequence 1', () => {
		expect(formatInvoiceNumber(2025, 1)).toBe('F2025-00001')
	})

	test('should format fiscal year 2025 sequence 42', () => {
		expect(formatInvoiceNumber(2025, 42)).toBe('F2025-00042')
	})

	test('should format fiscal year 2026 sequence 150', () => {
		expect(formatInvoiceNumber(2026, 150)).toBe('F2026-00150')
	})

	test('should format sequence 99999 as padded', () => {
		expect(formatInvoiceNumber(2025, 99999)).toBe('F2025-99999')
	})

	test('should format 6-digit sequence (overflow of 5-digit padding)', () => {
		expect(formatInvoiceNumber(2025, 100000)).toBe('F2025-100000')
	})
})

describe('parseInvoiceNumber', () => {
	test('should parse valid invoice number', () => {
		expect(parseInvoiceNumber('F2025-00001')).toEqual({
			fiscalYear: 2025,
			sequence: 1,
		})
	})

	test('should parse with larger sequence', () => {
		expect(parseInvoiceNumber('F2025-00150')).toEqual({
			fiscalYear: 2025,
			sequence: 150,
		})
	})

	test('should parse F2026-00042', () => {
		expect(parseInvoiceNumber('F2026-00042')).toEqual({
			fiscalYear: 2026,
			sequence: 42,
		})
	})

	test('should return null for non-matching format', () => {
		expect(parseInvoiceNumber('INV-00001')).toBeNull()
		expect(parseInvoiceNumber('F25-00001')).toBeNull()
		expect(parseInvoiceNumber('F2025-001')).toBeNull()
		expect(parseInvoiceNumber('F2025-000001')).toBeNull()
		expect(parseInvoiceNumber('')).toBeNull()
		expect(parseInvoiceNumber('F20250-00001')).toBeNull()
	})

	test('should return null for empty string', () => {
		expect(parseInvoiceNumber('')).toBeNull()
	})
})

describe('generateInvoiceNumber', () => {
	test('should generate invoice number in correct format', async () => {
		const invoiceNumber = await generateInvoiceNumber(2025)

		expect(invoiceNumber).toMatch(/^F\d{4}-\d{5}$/)
	})

	test('should start from F{year}-00001 when no invoices exist for that year', async () => {
		const invoiceNumber = await generateInvoiceNumber(2025)

		expect(invoiceNumber).toBe('F2025-00001')
	})

	test('should generate sequential invoice numbers within same fiscal year', async () => {
		const order1 = await createTestOrder('order-seq-1')
		const order2 = await createTestOrder('order-seq-2')

		const num1 = await generateInvoiceNumber(2025)
		await createTestInvoice(2025, 1, order1.id)

		const num2 = await generateInvoiceNumber(2025)
		await createTestInvoice(2025, 2, order2.id)

		const num3 = await generateInvoiceNumber(2025)

		expect(num1).toBe('F2025-00001')
		expect(num2).toBe('F2025-00002')
		expect(num3).toBe('F2025-00003')
	})

	test('should generate independent sequences for different fiscal years', async () => {
		const order2024 = await createTestOrder('order-2024')

		// Create invoice in 2024
		await createTestInvoice(2024, 1, order2024.id)

		// First invoice of 2025 should start at 1, not 2
		const num2025 = await generateInvoiceNumber(2025)
		expect(num2025).toBe('F2025-00001')

		// Second invoice of 2024 should be 2 (independent of 2025)
		const num2024_v2 = await generateInvoiceNumber(2024)
		expect(num2024_v2).toBe('F2024-00002')
	})

	test('should be unique across consecutive calls', async () => {
		const numbers: string[] = []
		for (let i = 0; i < 5; i++) {
			const order = await createTestOrder(`order-seq5-${i}`)
			const num = await generateInvoiceNumber(2025)
			numbers.push(num)
			const parsed = parseInvoiceNumber(num)
			await createTestInvoice(2025, parsed!.sequence, order.id, {
				subtotalCents: 1000 * (i + 1),
				totalCents: 1200 * (i + 1),
			})
		}

		const uniqueNumbers = new Set(numbers)
		expect(uniqueNumbers.size).toBe(5)

		// Verify sequential
		numbers.forEach((num, idx) => {
			expect(num).toBe(`F2025-${String(idx + 1).padStart(5, '0')}`)
		})
	})

	test('should work within an explicit transaction', async () => {
		const order = await createTestOrder('order-tx')

		const result = await prisma.$transaction(async (tx) => {
			const num = await generateInvoiceNumber(2025, tx)

			// Create the invoice within the same transaction
			const parsed = parseInvoiceNumber(num)!
			await tx.invoice.create({
				data: {
					fiscalYear: 2025,
					sequence: parsed.sequence,
					kind: 'INVOICE',
					orderId: order.id,
					subtotalCents: 5000,
					totalCents: 6000,
				},
			})

			return num
		})

		expect(result).toBe('F2025-00001')

		// Verify it was persisted
		const invoice = await prisma.invoice.findFirst({
			where: { orderId: order.id },
		})
		expect(invoice).toBeTruthy()
		expect(invoice!.fiscalYear).toBe(2025)
		expect(invoice!.sequence).toBe(1)
	})

	test('should respect existing invoices when generating next number', async () => {
		// Create invoices with sequences 1-3 for 2025
		for (let seq = 1; seq <= 3; seq++) {
			const order = await createTestOrder(`order-existing-${seq}`)
			await createTestInvoice(2025, seq, order.id)
		}

		const nextNum = await generateInvoiceNumber(2025)
		expect(nextNum).toBe('F2025-00004')
	})

	test('should handle non-contiguous sequences (gap)', async () => {
		// Create invoices with sequences 1, 2, 5 (gap at 3-4)
		for (const seq of [1, 2, 5]) {
			const order = await createTestOrder(`order-gap-${seq}`)
			await createTestInvoice(2025, seq, order.id)
		}

		const nextNum = await generateInvoiceNumber(2025)
		// Should be 6, not 3, because we use MAX(sequence) not find-first-gap
		expect(nextNum).toBe('F2025-00006')
	})

	test('should handle large fiscal years', async () => {
		const num = await generateInvoiceNumber(2030)
		expect(num).toBe('F2030-00001')
	})
})

describe('withInvoiceLock', () => {
	test('should serialize concurrent operations', async () => {
		const order: number[] = []

		// Simulate two concurrent invoice creations
		const [result1, result2] = await Promise.all([
			withInvoiceLock(async () => {
				order.push(1)
				await new Promise((r) => setTimeout(r, 10))
				order.push(2)
				return 'first'
			}),
			withInvoiceLock(async () => {
				order.push(3)
				await new Promise((r) => setTimeout(r, 5))
				order.push(4)
				return 'second'
			}),
		])

		expect(result1).toBe('first')
		expect(result2).toBe('second')
		// The lock should serialize: 1,2 then 3,4 — not interleaved
		expect(order).toEqual([1, 2, 3, 4])
	})

	test('should propagate errors without deadlocking', async () => {
		const error = new Error('test failure')

		await expect(
			withInvoiceLock(async () => {
				expect(await prisma.invoice.count()).toBe(0)
				throw error
			}),
		).rejects.toThrow('test failure')

		// Lock should be released even after error — subsequent lock should work
		await withInvoiceLock(async () => {
			expect(await prisma.invoice.count()).toBe(0)
		})
	})

	test('should work with generateInvoiceNumber to ensure uniqueness', async () => {
		const numbers: string[] = []

		// Create 5 invoices with lock — each generates number and creates record
		for (let i = 0; i < 5; i++) {
			await withInvoiceLock(async () => {
				const order = await createTestOrder(`order-lock-${i}`)
				const num = await generateInvoiceNumber(2025)
				numbers.push(num)
				const parsed = parseInvoiceNumber(num)!
				await createTestInvoice(2025, parsed.sequence, order.id, {
					subtotalCents: 1000 * (i + 1),
					totalCents: 1200 * (i + 1),
				})
			})
		}

		const uniqueNumbers = new Set(numbers)
		expect(uniqueNumbers.size).toBe(5)

		// Verify sequential: F2025-00001, F2025-00002, ...
		numbers.forEach((num, idx) => {
			expect(num).toBe(`F2025-${String(idx + 1).padStart(5, '0')}`)
		})
	})
	})

// ---------------------------------------------------------------------------
// getInvoicePdfData and getInvoicePdf tests
// ---------------------------------------------------------------------------

describe('getInvoicePdfData', () => {
	let orderId: string
	let invoiceId: string

	beforeEach(async () => {
		// Ensure 'uncategorized' category exists
		await prisma.category.upsert({
			where: { id: 'uncategorized' },
			update: { name: 'Uncategorized', slug: 'uncategorized' },
			create: { id: 'uncategorized', name: 'Uncategorized', slug: 'uncategorized' },
		})

		// Create a test user
		const user = await prisma.user.upsert({
			where: { email: 'invoice-pdf-test@example.com' },
			create: {
				email: 'invoice-pdf-test@example.com',
				name: 'PDF Test User',
				username: `pdf-user-${Date.now()}`,
			},
			update: {},
		})

		// Create a test order with user, shipping, VAT data
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-PDF-${Date.now()}`,
				userId: user.id,
				email: 'pdf-order@example.com',
				subtotal: 10000,
				total: 12000,
				shippingName: 'PDF Ship',
				shippingStreet: '789 PDF Blvd',
				shippingCity: 'Lyon',
				shippingPostal: '69001',
				shippingCountry: 'FR',
				shippingCost: 500,
				taxCountry: 'FR',
				customerVatNumber: 'FR12345678901',
				stripeCheckoutSessionId: `cs_pdf_${Date.now()}`,
				vatBreakdown: [
					{ kind: 'STANDARD', rate: 2000, baseCents: 9500, vatCents: 1900 },
				],
				vatTotalCents: 1900,
			},
		})
		orderId = order.id

		// Create a test product and order item
		const product = await prisma.product.create({
			data: {
				name: 'PDF Product',
				slug: `pdf-product-${Date.now()}`,
				sku: `PDF-${Date.now()}`,
				categoryId: 'uncategorized',
				price: 10000,
				stockQuantity: 999,
				taxKind: 'STANDARD',
			},
		})

		await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: product.id,
				price: 10000,
				quantity: 1,
			},
		})

		// Create an invoice for the order
		const fiscalYear = new Date().getFullYear()
		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear,
				sequence: 42,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 10000,
				totalCents: 12000,
				vatBreakdown: [
					{ kind: 'STANDARD', rate: 2000, baseCents: 9500, vatCents: 1900 },
				],
				vatTotalCents: 1900,
				status: 'FINAL',
				issuedAt: new Date('2026-02-15'),
			},
		})
		invoiceId = invoice.id
	})

	afterEach(async () => {
		await prisma.invoice.deleteMany({ where: { orderId } })
		await prisma.orderItem.deleteMany({ where: { orderId } })
		await prisma.order.deleteMany({ where: { id: orderId } })
		await prisma.product.deleteMany({ where: { name: 'PDF Product' } })
		await prisma.user.deleteMany({ where: { email: 'invoice-pdf-test@example.com' } })
	})

	test('should return InvoicePdfData with correct invoice number', async () => {
		const data = await getInvoicePdfData(invoiceId)

		expect(data.invoiceNumber).toBe(`F${new Date().getFullYear()}-00042`)
		expect(data.invoiceStatus).toBe('FINAL')
		expect(data.kind).toBe('INVOICE')
	})

	test('should return correct order details', async () => {
		const data = await getInvoicePdfData(invoiceId)

		expect(data.orderNumber).toContain('ORD-PDF-')
		expect(data.invoiceDate).toBe('2026-02-15')
		expect(data.subtotalCents).toBe(10000)
		expect(data.totalCents).toBe(12000)
	})

	test('should include customer information from user', async () => {
		const data = await getInvoicePdfData(invoiceId)

		expect(data.customer.name).toBe('PDF Test User')
		expect(data.customer.email).toBe('pdf-order@example.com')
		expect(data.customer.vatNumber).toBe('FR12345678901')
	})

	test('should include shipping information', async () => {
		const data = await getInvoicePdfData(invoiceId)

		expect(data.shipping.name).toBe('PDF Ship')
		expect(data.shipping.street).toBe('789 PDF Blvd')
		expect(data.shipping.city).toBe('Lyon')
		expect(data.shipping.postal).toBe('69001')
		expect(data.shipping.country).toBe('FR')
	})

	test('should include line items', async () => {
		const data = await getInvoicePdfData(invoiceId)

		expect(data.items).toHaveLength(1)
		expect(data.items[0].description).toBe('PDF Product')
		expect(data.items[0].quantity).toBe(1)
		expect(data.items[0].unitPriceCents).toBe(10000)
		expect(data.items[0].totalCents).toBe(10000)
	})

	test('should include VAT breakdown', async () => {
		const data = await getInvoicePdfData(invoiceId)

		expect(data.vatBreakdown).toHaveLength(1)
		expect(data.vatBreakdown[0]).toEqual({
			kind: 'STANDARD',
			rate: 2000,
			baseCents: 9500,
			vatCents: 1900,
		})
		expect(data.vatTotalCents).toBe(1900)
	})

	test('should include store information', async () => {
		const data = await getInvoicePdfData(invoiceId)

		expect(data.storeName).toBe('Epic Shop')
		expect(data.storeVatNumber).toBe('FR12345678901')
		expect(data.storeEmail).toBe('contact@epicshop.example.com')
		expect(data.currency).toBeTruthy()
		expect(data.currency!.code).toBe('USD')
		expect(data.currency!.symbol).toBe('$')
	})

	test('should throw for non-existent invoice', async () => {
		await expect(getInvoicePdfData('non-existent-id')).rejects.toThrow(
			'Invoice non-existent-id not found',
		)
	})
})

describe('getInvoicePdf', () => {
	let orderId: string
	let invoiceId: string

	beforeEach(async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-PDF2-${Date.now()}`,
				email: 'pdf2-order@example.com',
				subtotal: 5000,
				total: 5000,
				shippingName: 'Minimal Ship',
				shippingStreet: '1 Min St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				taxCountry: 'FR',
				stripeCheckoutSessionId: `cs_pdf2_${Date.now()}`,
				vatBreakdown: [],
				vatTotalCents: 0,
			},
		})
		orderId = order.id

		const fiscalYear = new Date().getFullYear()
		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear,
				sequence: 99,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 5000,
				totalCents: 5000,
				vatBreakdown: [],
				vatTotalCents: 0,
				status: 'FINAL',
			},
		})
		invoiceId = invoice.id
	})

	afterEach(async () => {
		await prisma.invoice.deleteMany({ where: { orderId } })
		await prisma.orderItem.deleteMany({ where: { orderId } })
		await prisma.order.deleteMany({ where: { id: orderId } })
	})

	test('should generate a non-empty PDF buffer', async () => {
		const pdfBuffer = await getInvoicePdf(invoiceId)
		expect(pdfBuffer).toBeInstanceOf(Buffer)
		expect(pdfBuffer.length).toBeGreaterThan(0)
		// PDFs start with '%PDF-'
		expect(pdfBuffer.toString('latin1').slice(0, 5)).toBe('%PDF-')
	})
})
