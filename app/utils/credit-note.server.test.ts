import { describe, expect, test, beforeEach, vi } from 'vitest'
import { prisma } from './db.server.ts'
import {
	formatCreditNoteNumber,
	parseCreditNoteNumber,
	generateCreditNoteNumber,
	createCreditNote,
	generateCreditNotePdf,
	type CreateCreditNoteItem,
	type CreateCreditNoteResult,
} from './credit-note.server.ts'

// Mock invoice-pdf to avoid MSW unhandled request warnings from @react-pdf/renderer
vi.mock('./invoice-pdf.server.tsx', () => ({
	generateInvoicePdf: vi.fn().mockResolvedValue(
		Buffer.from('%PDF-1.4 mock credit note pdf content '.repeat(8)),
	),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedTestData() {
	// Create a user
	const user = await prisma.user.create({
		data: {
			email: `test-credit-note-${Date.now()}@example.com`,
			username: `testcn_${Date.now()}`,
			name: 'Test Credit Note User',
		},
	})

	// Create a category (required FK for Product)
	const category = await prisma.category.create({
		data: {
			name: `Test Category ${Date.now()}`,
			slug: `test-category-${Date.now()}`,
		},
	})

	// Create a product
	const product = await prisma.product.create({
		data: {
			name: 'Test Product',
			slug: `test-product-${Date.now()}`,
			sku: `SKU-${Date.now()}`,
			description: 'A test product',
			price: 5000,
			status: 'ACTIVE',
			stockQuantity: 100,
			categoryId: category.id,
		} as any,
	})

	// Create an order with items
	const order = await prisma.order.create({
		data: {
			orderNumber: `CN-TEST-${Date.now()}`,
			userId: user.id,
			email: user.email,
			status: 'CONFIRMED',
			total: 15000,
			subtotal: 12000,
			shippingCost: 3000,
			shippingName: 'Test User',
			shippingStreet: '123 Test St',
			shippingCity: 'Paris',
			shippingPostal: '75001',
			shippingCountry: 'FR',
			stripeCheckoutSessionId: `cs_test_CN_${Date.now()}`,
			items: {
				create: [
					{
						productId: product.id,
						price: 5000,
						quantity: 2,
					},
					{
						productId: product.id,
						price: 5000,
						quantity: 1,
					},
				],
			},
		},
		include: {
			items: {
				include: {
					product: true,
					variant: true,
				},
			},
			invoices: true,
		},
	})

	// Create an invoice for the order
	const fy = new Date().getFullYear()
	const invoice = await prisma.invoice.create({
		data: {
			fiscalYear: fy,
			sequence: Math.floor(Date.now() % 100000),
			kind: 'INVOICE',
			orderId: order.id,
			subtotalCents: 12000,
			totalCents: 15000,
			vatBreakdown: [{ kind: 'STANDARD', rate: 2000, baseCents: 12000, vatCents: 2400 }],
			vatTotalCents: 2400,
			status: 'FINAL',
			issuedAt: new Date(),
		},
	})

	return { user, product, order, invoice }
}

// ---------------------------------------------------------------------------
// Pure function tests — no DB needed
// ---------------------------------------------------------------------------

describe('formatCreditNoteNumber', () => {
	test('formats year 2025 sequence 1', () => {
		expect(formatCreditNoteNumber(2025, 1)).toBe('CN-2025-00001')
	})

	test('formats year 2026 sequence 42', () => {
		expect(formatCreditNoteNumber(2026, 42)).toBe('CN-2026-00042')
	})

	test('pads sequence with leading zeros', () => {
		expect(formatCreditNoteNumber(2025, 99999)).toBe('CN-2025-99999')
	})

	test('handles year 2024', () => {
		expect(formatCreditNoteNumber(2024, 150)).toBe('CN-2024-00150')
	})
})

describe('parseCreditNoteNumber', () => {
	test('parses valid credit note number', () => {
		expect(parseCreditNoteNumber('CN-2025-00001')).toEqual({
			fiscalYear: 2025,
			sequence: 1,
		})
	})

	test('parses CN-2026-00042', () => {
		expect(parseCreditNoteNumber('CN-2026-00042')).toEqual({
			fiscalYear: 2026,
			sequence: 42,
		})
	})

	test('returns null for invoice format F2025-00001', () => {
		expect(parseCreditNoteNumber('F2025-00001')).toBeNull()
	})

	test('returns null for invalid format', () => {
		expect(parseCreditNoteNumber('CN-2025-1')).toBeNull()
		expect(parseCreditNoteNumber('CN2025-00001')).toBeNull()
		expect(parseCreditNoteNumber('XX-2025-00001')).toBeNull()
	})

	test('returns null for empty string', () => {
		expect(parseCreditNoteNumber('')).toBeNull()
	})

	test('returns null for non-year prefix', () => {
		expect(parseCreditNoteNumber('CN-abcd-00001')).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// Integration tests — require DB
// ---------------------------------------------------------------------------

describe('generateCreditNoteNumber', () => {
	test('generates CN-YYYY-NNNNN format', async () => {
		const number = await generateCreditNoteNumber(2025)
		expect(number).toMatch(/^CN-2025-\d{5}$/)
	})

	test('generates unique sequential numbers when credit notes are committed', async () => {
		const testOrder = await prisma.order.create({
			data: {
				orderNumber: `SEQ-TEST-${Date.now()}`,
				email: 'seq-test@example.com',
				status: 'CONFIRMED',
				total: 1000,
				subtotal: 1000,
				shippingName: 'Test',
				shippingStreet: '123 Test',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				stripeCheckoutSessionId: `cs_seq_${Date.now()}`,
			},
		})

		const num1 = await generateCreditNoteNumber(2025)
		// Commit a credit note to advance the sequence
		await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: parseInt(num1.split('-')[2]!, 10),
				kind: 'CREDIT_NOTE',
				orderId: testOrder.id,
				subtotalCents: -1000,
				totalCents: -1000,
				status: 'FINAL',
				issuedAt: new Date(),
			},
		})
		const num2 = await generateCreditNoteNumber(2025)
		expect(num1).not.toBe(num2)
		const seq2 = parseInt(num2.split('-')[2]!, 10)
		expect(seq2).toBeGreaterThan(parseInt(num1.split('-')[2]!, 10))
	})
})

describe('createCreditNote', () => {
	let invoice: any
	let order: any

	beforeEach(async () => {
		const data = await seedTestData()
		invoice = data.invoice
		order = data.order
	})

	test('full refund creates credit note with REFUNDED status', async () => {
		const items: CreateCreditNoteItem[] = order.items.map((oi: any) => ({
			description: oi.product.name,
			quantity: oi.quantity,
			unitPriceCents: oi.price,
			totalCents: oi.price * oi.quantity,
		}))

		const result = await createCreditNote(
			invoice.id,
			order.total,
			'Cancellation',
			items,
			order.shippingCost ?? 0,
		)

		expect(result.number).toMatch(/^CN-\d{4}-\d{5}$/)
		expect(result.isPartial).toBe(false)

		// Verify credit note record exists in DB
		const cn = await prisma.invoice.findUnique({
			where: { id: result.id },
		})
		expect(cn).not.toBeNull()
		expect(cn!.kind).toBe('CREDIT_NOTE')
		expect(cn!.reason).toBe('Cancellation')
		expect(cn!.parentInvoiceId).toBe(invoice.id)
		// Amounts should be negative (credit)
		expect(cn!.totalCents).toBeLessThan(0)

		// Parent invoice should be REFUNDED
		const parent = await prisma.invoice.findUnique({
			where: { id: invoice.id },
		})
		expect(parent!.status).toBe('REFUNDED')
	})

	test('partial refund creates credit note with PARTIALLY_REFUNDED status', async () => {
		// Refund only 1 of 3 items
		const items: CreateCreditNoteItem[] = [
			{
				description: order.items[0]!.product.name,
				quantity: order.items[0]!.quantity, // 2
				unitPriceCents: order.items[0]!.price,
				totalCents: order.items[0]!.price * order.items[0]!.quantity,
			},
		]

		const refundAmount = items[0]!.totalCents
		const result = await createCreditNote(
			invoice.id,
			refundAmount,
			'Partial Refund',
			items,
			0,
		)

		expect(result.number).toMatch(/^CN-\d{4}-\d{5}$/)
		expect(result.isPartial).toBe(true)

		// Parent invoice should be PARTIALLY_REFUNDED
		const parent = await prisma.invoice.findUnique({
			where: { id: invoice.id },
		})
		expect(parent!.status).toBe('PARTIALLY_REFUNDED')
	})

	test('stores reason on credit note record', async () => {
		const items: CreateCreditNoteItem[] = [
			{
				description: order.items[0]!.product.name,
				quantity: 1,
				unitPriceCents: order.items[0]!.price,
				totalCents: order.items[0]!.price,
			},
		]

		const result = await createCreditNote(
			invoice.id,
			5000,
			'Damaged on arrival',
			items,
			0,
		)

		const cn = await prisma.invoice.findUnique({
			where: { id: result.id },
		})
		expect(cn!.reason).toBe('Damaged on arrival')
	})

	test('throws for non-existent parent invoice', async () => {
		await expect(
			createCreditNote('nonexistent-id', 5000, 'Test', [
				{
					description: 'test',
					quantity: 1,
					unitPriceCents: 5000,
					totalCents: 5000,
				},
			]),
		).rejects.toThrow('Parent invoice nonexistent-id not found')
	})

	test('partial refund with single item out of multiple order items', async () => {
		// Order has 3 items (quantity 2+1=3), refund only 1
		const items: CreateCreditNoteItem[] = [
			{
				description: order.items[1]!.product.name,
				quantity: 1,
				unitPriceCents: order.items[1]!.price,
				totalCents: order.items[1]!.price,
			},
		]

		const result = await createCreditNote(
			invoice.id,
			5000,
			'Partial - wrong item',
			items,
			0,
		)

		expect(result.isPartial).toBe(true)
		const parent = await prisma.invoice.findUnique({
			where: { id: invoice.id },
		})
		expect(parent!.status).toBe('PARTIALLY_REFUNDED')
	})
})

describe('generateCreditNotePdf', () => {
	let invoice: any
	let order: any

	beforeEach(async () => {
		const data = await seedTestData()
		invoice = data.invoice
		order = data.order
	})

	test('generates a PDF buffer for a credit note', async () => {
		// First create a credit note
		const items: CreateCreditNoteItem[] = order.items.map((oi: any) => ({
			description: oi.product.name,
			quantity: oi.quantity,
			unitPriceCents: oi.price,
			totalCents: oi.price * oi.quantity,
		}))

		const result = await createCreditNote(
			invoice.id,
			order.total,
			'Cancellation',
			items,
			order.shippingCost ?? 0,
		)

		const pdfBuffer = await generateCreditNotePdf(
			result.id,
			order.orderNumber,
			order.createdAt,
			{
				name: order.shippingName,
				email: order.email,
				street: order.shippingStreet,
				city: order.shippingCity,
				postal: order.shippingPostal,
				country: order.shippingCountry,
			},
		)

		expect(Buffer.isBuffer(pdfBuffer)).toBe(true)
		expect(pdfBuffer.length).toBeGreaterThan(100)
		// PDFs start with %PDF
		expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF')
	})

	test('throws for non-existent credit note', async () => {
		await expect(
			generateCreditNotePdf(
				'nonexistent-id',
				'ORD-TEST',
				new Date(),
				{
					name: 'Test',
					email: 'test@example.com',
					street: '123 St',
					city: 'Paris',
					postal: '75001',
					country: 'FR',
				},
			),
		).rejects.toThrow('Credit note nonexistent-id not found')
	})
})
