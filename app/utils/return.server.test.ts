import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from './db.server.ts'
import { updateReturnStatus, updateReturnAdminNotes } from './return.server.ts'
import { createReturnRequest } from './return-queries.server.ts'
import { sendEmail } from './email.server.ts'
import { createProductData } from '#tests/product-utils.ts'

// Mock Sentry
vi.mock('@sentry/react-router', () => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
}))

// Mock email service
vi.mock('./email.server.ts', () => ({
	sendEmail: vi.fn().mockResolvedValue({
		status: 'success' as const,
		data: { id: 'email-123' },
	}),
}))

describe('updateReturnStatus', () => {
	let orderId: string
	let orderItemId: string
	let returnRequestId: string
	let productId: string
	let userId: string

	beforeEach(async () => {
		vi.clearAllMocks()

		// Create test user
		const user = await prisma.user.create({
			data: {
				email: `test-return-${Date.now()}@example.com`,
				username: `testreturn${Date.now()}`,
				name: 'Test Return User',
			},
		})
		userId = user.id

		// Create test product
		const productData = createProductData()
		productData.price = 1999 // Price in cents
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE' as const,
				categoryId: productData.categoryId,
			},
		})
		productId = product.id

		// Create order with an item
		const order = await prisma.order.create({
			data: {
				orderNumber: `RET-TEST-${Date.now()}`,
				email: user.email,
				userId: user.id,
				subtotal: 1999,
				total: 1999,
				shippingName: 'Test Return User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				stripeCheckoutSessionId: `cs_ret_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})
		orderId = order.id

		const orderItem = await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: product.id,
				quantity: 1,
				price: 1999,
			},
		})
		orderItemId = orderItem.id

		// Create a return request
		const returnReq = await createReturnRequest({
			orderId,
			reason: 'Defective item',
			items: [{ orderItemId, quantity: 1 }],
		})
		returnRequestId = returnReq.id
	})

	afterEach(async () => {
		// Clean up in reverse order
		await prisma.returnItem.deleteMany({ where: { returnRequestId } })
		await prisma.returnRequest.deleteMany({ where: { id: returnRequestId } })
		await prisma.orderItem.deleteMany({ where: { id: orderItemId } })
		await prisma.order.deleteMany({ where: { id: orderId } })
		await prisma.product.deleteMany({ where: { id: productId } })
		await prisma.user.deleteMany({ where: { id: userId } })
	})

	test('rejects duplicate REQUESTED status (no-op transition)', async () => {
		await expect(
			updateReturnStatus(returnRequestId, 'REQUESTED'),
		).rejects.toThrow('Invalid status transition')
	})

	test('allows REQUESTED → APPROVED', async () => {
		const updated = await updateReturnStatus(returnRequestId, 'APPROVED')
		expect(updated.status).toBe('APPROVED')
	})

	test('allows REQUESTED → REJECTED', async () => {
		const updated = await updateReturnStatus(returnRequestId, 'REJECTED')
		expect(updated.status).toBe('REJECTED')
	})

	test('rejects REQUESTED → RECEIVED (skipping APPROVED)', async () => {
		await expect(
			updateReturnStatus(returnRequestId, 'RECEIVED'),
		).rejects.toThrow('Invalid status transition')
	})

	test('allows APPROVED → SHIPPED', async () => {
		await updateReturnStatus(returnRequestId, 'APPROVED')
		const updated = await updateReturnStatus(returnRequestId, 'SHIPPED')
		expect(updated.status).toBe('SHIPPED')
	})

	test('allows APPROVED → REJECTED', async () => {
		await updateReturnStatus(returnRequestId, 'APPROVED')
		const updated = await updateReturnStatus(returnRequestId, 'REJECTED')
		expect(updated.status).toBe('REJECTED')
	})

	test('allows SHIPPED → RECEIVED', async () => {
		await updateReturnStatus(returnRequestId, 'APPROVED')
		await updateReturnStatus(returnRequestId, 'SHIPPED')
		const updated = await updateReturnStatus(returnRequestId, 'RECEIVED')
		expect(updated.status).toBe('RECEIVED')
		expect(updated.receivedAt).toBeDefined()
	})

	test('allows SHIPPED → REJECTED', async () => {
		await updateReturnStatus(returnRequestId, 'APPROVED')
		await updateReturnStatus(returnRequestId, 'SHIPPED')
		const updated = await updateReturnStatus(returnRequestId, 'REJECTED')
		expect(updated.status).toBe('REJECTED')
	})

	test('rejects SHIPPED → REFUNDED (must go through RECEIVED)', async () => {
		await updateReturnStatus(returnRequestId, 'APPROVED')
		await updateReturnStatus(returnRequestId, 'SHIPPED')
		await expect(
			updateReturnStatus(returnRequestId, 'REFUNDED'),
		).rejects.toThrow('Invalid status transition')
	})

	test('allows RECEIVED → REFUNDED', async () => {
		await updateReturnStatus(returnRequestId, 'APPROVED')
		await updateReturnStatus(returnRequestId, 'SHIPPED')
		await updateReturnStatus(returnRequestId, 'RECEIVED')
		const updated = await updateReturnStatus(returnRequestId, 'REFUNDED')
		expect(updated.status).toBe('REFUNDED')
		expect(updated.refundedAt).toBeDefined()
	})

	test('rejects REFUNDED → anything (terminal state)', async () => {
		await updateReturnStatus(returnRequestId, 'APPROVED')
		await updateReturnStatus(returnRequestId, 'SHIPPED')
		await updateReturnStatus(returnRequestId, 'RECEIVED')
		await updateReturnStatus(returnRequestId, 'REFUNDED')

		await expect(
			updateReturnStatus(returnRequestId, 'REQUESTED'),
		).rejects.toThrow('Invalid status transition')
	})

	test('rejects REJECTED → anything (terminal state)', async () => {
		await updateReturnStatus(returnRequestId, 'REJECTED')

		await expect(
			updateReturnStatus(returnRequestId, 'APPROVED'),
		).rejects.toThrow('Invalid status transition')
	})

	test('sets adminNotes when provided', async () => {
		const updated = await updateReturnStatus(
			returnRequestId,
			'APPROVED',
			'Customer contacted, return authorized',
		)
		expect(updated.adminNotes).toBe('Customer contacted, return authorized')
	})

	test('sets refundAmountCents and restockingFeeCents on REFUNDED', async () => {
		await updateReturnStatus(returnRequestId, 'APPROVED')
		await updateReturnStatus(returnRequestId, 'SHIPPED')
		await updateReturnStatus(returnRequestId, 'RECEIVED')
		const updated = await updateReturnStatus(
			returnRequestId,
			'REFUNDED',
			null,
			1999,
			500,
		)
		expect(updated.refundAmountCents).toBe(1999)
		expect(updated.restockingFeeCents).toBe(500)
	})

	test('throws 404 for non-existent return request', async () => {
		await expect(
			updateReturnStatus('nonexistent-id', 'APPROVED'),
		).rejects.toThrow('Return request not found')
	})

	test('sends email notification when status changes to APPROVED', async () => {
		await updateReturnStatus(
			returnRequestId,
			'APPROVED',
			'Return approved',
		)

		expect(sendEmail).toHaveBeenCalledTimes(1)
		const emailCall = vi.mocked(sendEmail).mock.calls[0]?.[0]
		expect(emailCall?.to).toContain('test-return-')
		expect(emailCall?.subject).toContain('Return')
	})

	test('sends email notification when status changes to REJECTED', async () => {
		await updateReturnStatus(
			returnRequestId,
			'REJECTED',
			'Item not eligible for return',
		)

		expect(sendEmail).toHaveBeenCalledTimes(1)
		const emailCall = vi.mocked(sendEmail).mock.calls[0]?.[0]
		expect(emailCall?.subject).toContain('Return')
	})
})

describe('updateReturnAdminNotes', () => {
	let returnRequestId: string
	let orderId: string
	let orderItemId: string
	let productId: string
	let userId: string

	beforeEach(async () => {
		vi.clearAllMocks()

		const user = await prisma.user.create({
			data: {
				email: `test-notes-${Date.now()}@example.com`,
				username: `testnotes${Date.now()}`,
				name: 'Test Notes User',
			},
		})
		userId = user.id

		const productData = createProductData()
		productData.price = 1999
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE' as const,
				categoryId: productData.categoryId,
			},
		})
		productId = product.id

		const order = await prisma.order.create({
			data: {
				orderNumber: `NOTES-TEST-${Date.now()}`,
				email: user.email,
				userId: user.id,
				subtotal: 1999,
				total: 1999,
				shippingName: 'Test Notes User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				stripeCheckoutSessionId: `cs_notes_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})
		orderId = order.id

		const orderItem = await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: product.id,
				quantity: 1,
				price: 1999,
			},
		})
		orderItemId = orderItem.id

		const returnReq = await createReturnRequest({
			orderId: order.id,
			reason: 'Changed my mind',
			items: [{ orderItemId, quantity: 1 }],
		})
		returnRequestId = returnReq.id
	})

	afterEach(async () => {
		await prisma.returnItem.deleteMany({ where: { returnRequestId } })
		await prisma.returnRequest.deleteMany({ where: { id: returnRequestId } })
		await prisma.orderItem.deleteMany({ where: { id: orderItemId } })
		await prisma.order.deleteMany({ where: { id: orderId } })
		await prisma.product.deleteMany({ where: { id: productId } })
		await prisma.user.deleteMany({ where: { id: userId } })
	})

	test('updates admin notes without changing status', async () => {
		const updated = await updateReturnAdminNotes(
			returnRequestId,
			'Internal note: customer VIP',
		)
		expect(updated.adminNotes).toBe('Internal note: customer VIP')
		expect(updated.status).toBe('REQUESTED')
	})
})
