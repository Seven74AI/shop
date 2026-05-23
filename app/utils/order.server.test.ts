import * as Sentry from '@sentry/react-router'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { createProductData, createVariantData } from '#tests/product-utils.ts'
import { UNCATEGORIZED_CATEGORY_ID } from './category.ts'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { validateStockAvailability, updateOrderStatus, createInvoiceForOrder, getAdminOrders } from './order.server.ts'
import { parseInvoiceNumber } from './invoice.server.ts'

// Mock stripe
vi.mock('./stripe.server.ts', () => ({
	stripe: {
		refunds: {
			create: vi.fn().mockResolvedValue({ id: 're_test_refund' }),
		},
		checkout: {
			sessions: {
				retrieve: vi.fn(),
			},
		},
		paymentIntents: {
			retrieve: vi.fn(),
		},
	},
}))

// Mock invoice-pdf
vi.mock('./invoice-pdf.server.tsx', () => ({
	generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}))

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

// Mock getDomainUrl
vi.mock('./misc.tsx', () => ({
	getDomainUrl: vi.fn(() => 'http://localhost:3000'),
}))

// Import after mocking
// sendEmail is already imported above

describe('validateStockAvailability', () => {
	let categoryId: string
	let productId: string
	let variantId: string
	let cartId: string

	beforeEach(async () => {
		// Create test category (use upsert to handle case where cleanup didn't run)
		const category = await prisma.category.upsert({
			where: { id: UNCATEGORIZED_CATEGORY_ID },
			update: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
			create: {
				id: UNCATEGORIZED_CATEGORY_ID,
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
		})
		categoryId = category.id

		// Create test product using utility
		const productData = createProductData()
		productData.categoryId = categoryId
		// Price in cents (utility returns dollars)
		productData.price = Math.round(productData.price * 100)
		
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE' as const,
				categoryId: productData.categoryId!,
			},
		})
		productId = product.id

		// Create test variant with stock using utility
		const variantData = createVariantData(productData.sku)
		variantData.stockQuantity = 10 // Override for test consistency
		
		const variant = await prisma.productVariant.create({
			data: {
				productId,
				sku: variantData.sku,
				stockQuantity: variantData.stockQuantity,
			},
		})
		variantId = variant.id

		// Create test cart
		const cart = await prisma.cart.create({
			data: {
				sessionId: `session-${Date.now()}`,
			},
		})
		cartId = cart.id
	})

	afterEach(async () => {
		// Cleanup - delete in reverse order of creation
		await prisma.cartItem.deleteMany({})
		await prisma.cart.deleteMany({})
		await prisma.productVariant.deleteMany({})
		await prisma.product.deleteMany({})
		await prisma.category.deleteMany({
			where: { id: categoryId },
		})
	})

	test('should validate stock availability when sufficient stock exists', async () => {
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 5, // Requesting 5, have 10 in stock
			},
		})

		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should throw error when insufficient stock', async () => {
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 15, // Requesting 15, only have 10 in stock
			},
		})

		await expect(validateStockAvailability(cartId)).rejects.toThrow(
			'Insufficient stock',
		)
	})

	test('should handle deleted variant gracefully', async () => {
		// Create a variant and cart item
		const tempVariant = await prisma.productVariant.create({
			data: {
				productId,
				sku: `TEMP-${Date.now()}`,
				stockQuantity: 10,
			},
		})

		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: tempVariant.id,
				quantity: 5,
			},
		})

		// Delete the variant - due to onDelete: SetNull, variantId becomes null
		await prisma.productVariant.delete({
			where: { id: tempVariant.id },
		})

		// Reload cart to get updated variantId (now null)
		const cart = await prisma.cart.findUnique({
			where: { id: cartId },
			include: { items: true },
		})

		// Cart item should now have variantId = null (due to onDelete: SetNull)
		expect(cart?.items[0]?.variantId).toBeNull()

		// Validation should pass because products without variants and no stockQuantity are unlimited
		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should validate product-level stock when product has no variants', async () => {
		// Delete the variant to make this a product without variants
		await prisma.productVariant.delete({
			where: { id: variantId },
		})

		// Update product to have stock quantity
		await prisma.product.update({
			where: { id: productId },
			data: { stockQuantity: 10 },
		})

		// Add item without variant
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: null,
				quantity: 5, // Requesting 5, have 10 in stock
			},
		})

		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should throw error when product-level stock is insufficient', async () => {
		// Delete the variant to make this a product without variants
		await prisma.productVariant.delete({
			where: { id: variantId },
		})

		// Update product to have stock quantity
		await prisma.product.update({
			where: { id: productId },
			data: { stockQuantity: 3 },
		})

		// Add item without variant
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: null,
				quantity: 5, // Requesting 5, only have 3 in stock
			},
		})

		await expect(validateStockAvailability(cartId)).rejects.toThrow(
			'Insufficient stock',
		)
	})

	test('should handle product without variant and no stockQuantity as unlimited', async () => {
		// Delete the variant to make this a product without variants
		await prisma.productVariant.delete({
			where: { id: variantId },
		})

		// Product has no stockQuantity set (null)
		// Add item without variant
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: null,
				quantity: 1,
			},
		})

		// Should not throw for products without variants and no stockQuantity (unlimited)
		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should prioritize variant stock over product stock when variant exists', async () => {
		// Set product stock to a low amount
		await prisma.product.update({
			where: { id: productId },
			data: { stockQuantity: 2 },
		})

		// Variant has more stock (10)
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 5, // Requesting 5, variant has 10
			},
		})

		// Should use variant stock, not product stock
		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should handle multiple items with mixed stock availability', async () => {
		// Create second variant
		const variant2 = await prisma.productVariant.create({
			data: {
				productId,
				sku: `VARIANT-2-${Date.now()}`,
				stockQuantity: 3,
			},
		})

		// Item 1: Sufficient stock
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 5,
			},
		})

		// Item 2: Sufficient stock
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: variant2.id,
				quantity: 2,
			},
		})

		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should throw error when any item has insufficient stock', async () => {
		// Create second variant
		const variant2 = await prisma.productVariant.create({
			data: {
				productId,
				sku: `VARIANT-2-${Date.now()}`,
				stockQuantity: 3,
			},
		})

		// Item 1: Sufficient stock
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 5,
			},
		})

		// Item 2: Insufficient stock
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: variant2.id,
				quantity: 5, // Requesting 5, only have 3
			},
		})

		await expect(validateStockAvailability(cartId)).rejects.toThrow(
			'Insufficient stock',
		)
	})

	test('should throw error when cart is empty', async () => {
		await expect(validateStockAvailability(cartId)).rejects.toThrow(
			'Cart is empty',
		)
	})

	test('should throw error when cart does not exist', async () => {
		await expect(validateStockAvailability('non-existent-cart')).rejects.toThrow()
	})
})

describe('updateOrderStatus', () => {
	let orderId: string
	let orderNumber: string

	beforeEach(async () => {
		vi.clearAllMocks()
		
		// Create a test order
		const order = await prisma.order.create({
			data: {
				orderNumber: 'ORD-TEST-001',
				email: 'test@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})
		orderId = order.id
		orderNumber = order.orderNumber
	})

	afterEach(async () => {
		await prisma.orderItem.deleteMany({ where: { orderId } })
		await prisma.order.deleteMany({ where: { id: orderId } })
	})

	test('should update order status and send email notification', async () => {
		await updateOrderStatus(orderId, 'SHIPPED')

		// Verify status was updated
		const updatedOrder = await prisma.order.findUnique({
			where: { id: orderId },
		})
		expect(updatedOrder?.status).toBe('SHIPPED')

		// Verify email was sent
		expect(sendEmail).toHaveBeenCalledTimes(1)
		const emailCall = vi.mocked(sendEmail).mock.calls[0]?.[0]
		expect(emailCall?.to).toBe('test@example.com')
		expect(emailCall?.subject).toBe(`Order Status Update - ${orderNumber}`)
		expect(emailCall?.html).toContain(orderNumber)
		expect(emailCall?.html).toContain('Shipped') // Human-readable label
		expect(emailCall?.text).toContain(orderNumber)
		expect(emailCall?.text).toContain('Shipped') // Human-readable label
	})

	test('should include order details in email', async () => {
		await updateOrderStatus(orderId, 'DELIVERED')

		const emailCall = vi.mocked(sendEmail).mock.calls[0]?.[0]
		expect(emailCall?.html).toContain('Order Status Update')
		expect(emailCall?.html).toContain(orderNumber)
		expect(emailCall?.html).toContain('Delivered') // Human-readable label
		expect(emailCall?.html).toContain('/shop/orders/' + orderNumber)
	})

	test('should handle email sending failure gracefully', async () => {
		
		// Mock email sending to fail
		vi.mocked(sendEmail).mockRejectedValueOnce(
			new Error('Email service unavailable'),
		)

		// Should not throw - status update should succeed even if email fails
		await expect(updateOrderStatus(orderId, 'SHIPPED')).resolves.not.toThrow()

		// Verify status was still updated
		const updatedOrder = await prisma.order.findUnique({
			where: { id: orderId },
		})
		expect(updatedOrder?.status).toBe('SHIPPED')

		// Verify error was logged to Sentry
		expect(Sentry.captureException).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				tags: { context: 'order-status-email' },
			}),
		)
	})

	test('should send email for all status transitions', async () => {
		const statuses: Array<'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'> = [
			'PENDING',
			'SHIPPED',
			'DELIVERED',
		]

		for (const status of statuses) {
			await updateOrderStatus(orderId, status)
			const updatedOrder = await prisma.order.findUnique({
				where: { id: orderId },
			})
			expect(updatedOrder?.status).toBe(status)
		}

	// Should have sent 3 emails (one for each status change)
	expect(sendEmail).toHaveBeenCalledTimes(3)
	})
})
	describe('tax integration in order creation', () => {
		let categoryId: string
		let productId: string

		beforeEach(async () => {
			// Use upsert to handle case where cleanup didn't run
			const category = await prisma.category.upsert({
				where: { id: 'uncategorized' },
				update: { name: 'Test Category', slug: `test-cat-${Date.now()}` },
				create: { id: 'uncategorized', name: 'Test Category', slug: `test-cat-${Date.now()}` },
			})
			categoryId = category.id

			const product = await prisma.product.create({
				data: {
					name: 'Tax Test Product',
					slug: `tax-test-${Date.now()}`,
					sku: `TAX-${Date.now()}`,
					price: 1000,
					taxKind: 'STANDARD',
					categoryId: category.id,
					status: 'ACTIVE',
				},
			})
			productId = product.id

			// Seed FR tax rates for the test
			const rates = [
				{ country: 'FR', kind: 'STANDARD' as const, rate: 2000, isActive: true, effectiveFrom: new Date('2024-01-01') },
				{ country: 'FR', kind: 'REDUCED' as const, rate: 1000, isActive: true, effectiveFrom: new Date('2024-01-01') },
				{ country: 'DE', kind: 'STANDARD' as const, rate: 1900, isActive: true, effectiveFrom: new Date('2024-01-01') },
			]
			for (const r of rates) {
				try {
					await prisma.taxRate.create({ data: r })
				} catch {
					// Already exists
				}
			}
		})

		afterEach(async () => {
			await prisma.taxRate.deleteMany({})
			await prisma.product.deleteMany({ where: { id: productId } })
			await prisma.category.deleteMany({ where: { id: categoryId } })
		})

		test('order with domestic shipping stores correct VAT data', async () => {
			const order = await prisma.order.create({
				data: {
					orderNumber: 'ORD-TAX-001',
					email: 'tax@test.com',
					subtotal: 1000,
					total: 1200,
					shippingName: 'Tax Test',
					shippingStreet: '123 VAT St',
					shippingCity: 'Paris',
					shippingPostal: '75001',
					shippingCountry: 'FR',
					stripeCheckoutSessionId: `cs_tax_test_${Date.now()}`,
					taxCountry: 'FR',
					vatTotalCents: 200,
					vatBreakdown: [
						{ kind: 'STANDARD', rate: 2000, baseCents: 1000, vatCents: 200 },
					],
					vatValidationStatus: 'UNCHECKED',
				},
			})

			expect(order.taxCountry).toBe('FR')
			expect(order.vatTotalCents).toBe(200)
			expect(order.vatValidationStatus).toBe('UNCHECKED')

			// Verify JSON breakdown persisted
			const breakdown = order.vatBreakdown as any[]
			expect(breakdown).toHaveLength(1)
			expect(breakdown[0]).toEqual({ kind: 'STANDARD', rate: 2000, baseCents: 1000, vatCents: 200 })

			// Cleanup
			await prisma.order.delete({ where: { id: order.id } })
		})

		test('order with EU B2B reverse charge stores 0% VAT', async () => {
			const order = await prisma.order.create({
				data: {
					orderNumber: 'ORD-TAX-002',
					email: 'b2b@test.com',
					subtotal: 5000,
					total: 5000,
					shippingName: 'B2B Buyer',
					shippingStreet: '456 Business Ave',
					shippingCity: 'Berlin',
					shippingPostal: '10115',
					shippingCountry: 'DE',
					stripeCheckoutSessionId: `cs_tax_b2b_${Date.now()}`,
					taxCountry: 'DE',
					customerVatNumber: 'DE123456789',
					vatTotalCents: 0,
					vatBreakdown: [
						{ kind: 'STANDARD', rate: 0, baseCents: 5000, vatCents: 0 },
					],
					vatValidationStatus: 'UNCHECKED',
				},
			})

			expect(order.taxCountry).toBe('DE')
			expect(order.vatTotalCents).toBe(0)
			expect(order.customerVatNumber).toBe('DE123456789')

			await prisma.order.delete({ where: { id: order.id } })
		})

		test('order with export stores 0% VAT', async () => {
			const order = await prisma.order.create({
				data: {
					orderNumber: 'ORD-TAX-003',
					email: 'export@test.com',
					subtotal: 3000,
					total: 3000,
					shippingName: 'Export Buyer',
					shippingStreet: '789 Export Blvd',
					shippingCity: 'New York',
					shippingPostal: '10001',
					shippingCountry: 'US',
					stripeCheckoutSessionId: `cs_tax_export_${Date.now()}`,
					taxCountry: 'US',
					vatTotalCents: 0,
					vatBreakdown: [],
					vatValidationStatus: 'UNCHECKED',
				},
			})

			expect(order.taxCountry).toBe('US')
			expect(order.vatTotalCents).toBe(0)
			expect(order.vatBreakdown).toEqual([])

			await prisma.order.delete({ where: { id: order.id } })
		})
	})

describe('processReturnRefund', () => {
	let orderId: string
	let returnRequestId: string
	let invoiceId: string
	let orderItemId: string
	let productId: string

	beforeEach(async () => {
		// Reset mocks
		vi.clearAllMocks()

		// Create product
		const product = await prisma.product.create({
			data: {
				id: `prod-${Date.now()}`,
				name: 'Test Product',
				sku: `SKU-${Date.now()}`,
				slug: `test-product-${Date.now()}`,
				price: 2000,
				stockQuantity: 100,
				categoryId: (await prisma.category.findFirst())?.id ?? 'cat-test',
			},
		})
		productId = product.id

		// Create order
		const order = await prisma.order.create({
			data: {
				id: `order-${Date.now()}`,
				orderNumber: `TEST-${Date.now()}`,
				email: 'customer@example.com',
				subtotal: 4000,
				total: 4800,
				shippingCost: 800,
				shippingName: 'Test Customer',
				shippingStreet: '123 Rue Test',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				stripePaymentIntentId: 'pi_test_order',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})
		orderId = order.id

		// Create order item
		const oi = await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: product.id,
				price: 2000,
				quantity: 2,
			},
		})
		orderItemId = oi.id

		// Create invoice
		const invoice = await prisma.invoice.create({
			data: {
				fiscalYear: 2025,
				sequence: 1,
				kind: 'INVOICE',
				orderId: order.id,
				subtotalCents: 4000,
				totalCents: 4800,
				status: 'FINAL',
				issuedAt: new Date(),
			},
		})
		invoiceId = invoice.id

		// Create return request
		const rr = await prisma.returnRequest.create({
			data: {
				id: `ret-${Date.now()}`,
				orderId: order.id,
				status: 'RECEIVED',
				reason: 'Wrong size',
				items: {
					create: {
						orderItemId: oi.id,
						quantity: 1, // Partial return: 1 of 2 items
					},
				},
			},
		})
		returnRequestId = rr.id
	})

	afterEach(async () => {
		// Clean up in reverse dependency order
		await prisma.returnItem.deleteMany({ where: { returnRequestId } }).catch(() => {})
		await prisma.returnRequest.deleteMany({ where: { id: returnRequestId } }).catch(() => {})
		// Delete all invoices for this order (including credit notes created by processReturnRefund)
		await prisma.invoice.deleteMany({ where: { orderId } }).catch(() => {})
		await prisma.orderItem.deleteMany({ where: { id: orderItemId } }).catch(() => {})
		await prisma.order.deleteMany({ where: { id: orderId } }).catch(() => {})
		await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {})
	})

	test('processes Stripe refund, credit note, and updates status', async () => {
		const { processReturnRefund } = await import('./order.server.ts')

		const result = await processReturnRefund(returnRequestId)

		expect(result.refundId).toBe('re_test_refund')
		expect(result.creditNoteNumber).toMatch(/^CN-\\d{4}-\\d{5}$/)

		// Verify Stripe refund was called with correct amount
		const { stripe } = await import('./stripe.server.ts')
		expect(stripe.refunds.create).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: 2000, // 1 item * 2000 cents
				reason: 'requested_by_customer',
				payment_intent: 'pi_test_order',
			}),
		)

		// Verify return status was updated
		const rr = await prisma.returnRequest.findUnique({
			where: { id: returnRequestId },
		})
		expect(rr?.status).toBe('REFUNDED')
		expect(rr?.refundAmountCents).toBe(2000)
		expect(rr?.refundedAt).toBeTruthy()

		// Verify credit note was created
		const creditNote = await prisma.invoice.findFirst({
			where: { parentInvoiceId: invoiceId, kind: 'CREDIT_NOTE' },
		})
		expect(creditNote).toBeTruthy()
		expect(creditNote!.totalCents).toBeLessThan(0)

		// Verify email was sent with attachment
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'customer@example.com',
				subject: expect.stringContaining('Refund Processed'),
				attachments: expect.arrayContaining([
					expect.objectContaining({
						filename: expect.stringContaining('Avoir-'),
					}),
				]),
			}),
		)
	})

	test('returns early if already REFUNDED (idempotency)', async () => {
		// First set the return to REFUNDED
		await prisma.returnRequest.update({
			where: { id: returnRequestId },
			data: { status: 'REFUNDED' },
		})

		const { processReturnRefund } = await import('./order.server.ts')
		const result = await processReturnRefund(returnRequestId)

		expect(result.refundId).toBeNull()
		expect(result.creditNoteNumber).toBeNull()

		// Stripe should NOT have been called
		const { stripe } = await import('./stripe.server.ts')
		expect(stripe.refunds.create).not.toHaveBeenCalled()
	})

	test('applies restocking fee to reduce refund', async () => {
		// Set restocking fee on the return request
		await prisma.returnRequest.update({
			where: { id: returnRequestId },
			data: { restockingFeeCents: 300 },
		})

		const { processReturnRefund } = await import('./order.server.ts')
		const _result = await processReturnRefund(returnRequestId)

		// Refund should be 2000 - 300 = 1700
		const { stripe } = await import('./stripe.server.ts')
		expect(stripe.refunds.create).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: 1700,
			}),
		)

		const rr = await prisma.returnRequest.findUnique({
			where: { id: returnRequestId },
		})
		expect(rr?.refundAmountCents).toBe(1700)
		expect(rr?.restockingFeeCents).toBe(300)
	})

	test('handles Stripe refund failure gracefully', async () => {
		const { stripe } = await import('./stripe.server.ts')
		vi.mocked(stripe.refunds.create).mockRejectedValueOnce(
			new Error('Stripe API error'),
		)

		const { processReturnRefund } = await import('./order.server.ts')

		await expect(processReturnRefund(returnRequestId)).rejects.toThrow(
			'Stripe API error',
		)

		// Return should NOT be marked as REFUNDED
		const rr = await prisma.returnRequest.findUnique({
			where: { id: returnRequestId },
		})
		expect(rr?.status).toBe('RECEIVED') // unchanged
	})
})
	describe('tax integration in order creation', () => {
		let categoryId: string
		let productId: string

		beforeEach(async () => {
			// Use upsert to handle case where cleanup didn't run
			const category = await prisma.category.upsert({
				where: { id: 'uncategorized' },
				update: { name: 'Test Category', slug: `test-cat-${Date.now()}` },
				create: { id: 'uncategorized', name: 'Test Category', slug: `test-cat-${Date.now()}` },
			})
			categoryId = category.id

			const product = await prisma.product.create({
				data: {
					name: 'Tax Test Product',
					slug: `tax-test-${Date.now()}`,
					sku: `TAX-${Date.now()}`,
					price: 1000,
					taxKind: 'STANDARD',
					categoryId: category.id,
					status: 'ACTIVE',
				},
			})
			productId = product.id

			// Seed FR tax rates for the test
			const rates = [
				{ country: 'FR', kind: 'STANDARD' as const, rate: 2000, isActive: true, effectiveFrom: new Date('2024-01-01') },
				{ country: 'FR', kind: 'REDUCED' as const, rate: 1000, isActive: true, effectiveFrom: new Date('2024-01-01') },
				{ country: 'DE', kind: 'STANDARD' as const, rate: 1900, isActive: true, effectiveFrom: new Date('2024-01-01') },
			]
			for (const r of rates) {
				try {
					await prisma.taxRate.create({ data: r })
				} catch {
					// Already exists
				}
			}
		})

		afterEach(async () => {
			await prisma.taxRate.deleteMany({})
			await prisma.product.deleteMany({ where: { id: productId } })
			await prisma.category.deleteMany({ where: { id: categoryId } })
		})

		test('order with domestic shipping stores correct VAT data', async () => {
			const order = await prisma.order.create({
				data: {
					orderNumber: 'ORD-TAX-001',
					email: 'tax@test.com',
					subtotal: 1000,
					total: 1200,
					shippingName: 'Tax Test',
					shippingStreet: '123 VAT St',
					shippingCity: 'Paris',
					shippingPostal: '75001',
					shippingCountry: 'FR',
					stripeCheckoutSessionId: `cs_tax_test_${Date.now()}`,
					taxCountry: 'FR',
					vatTotalCents: 200,
					vatBreakdown: [
						{ kind: 'STANDARD', rate: 2000, baseCents: 1000, vatCents: 200 },
					],
					vatValidationStatus: 'UNCHECKED',
				},
			})

			expect(order.taxCountry).toBe('FR')
			expect(order.vatTotalCents).toBe(200)
			expect(order.vatValidationStatus).toBe('UNCHECKED')

			// Verify JSON breakdown persisted
			const breakdown = order.vatBreakdown as any[]
			expect(breakdown).toHaveLength(1)
			expect(breakdown[0]).toEqual({ kind: 'STANDARD', rate: 2000, baseCents: 1000, vatCents: 200 })

			// Cleanup
			await prisma.order.delete({ where: { id: order.id } })
		})

		test('order with EU B2B reverse charge stores 0% VAT', async () => {
			const order = await prisma.order.create({
				data: {
					orderNumber: 'ORD-TAX-002',
					email: 'b2b@test.com',
					subtotal: 5000,
					total: 5000,
					shippingName: 'B2B Buyer',
					shippingStreet: '456 Business Ave',
					shippingCity: 'Berlin',
					shippingPostal: '10115',
					shippingCountry: 'DE',
					stripeCheckoutSessionId: `cs_tax_b2b_${Date.now()}`,
					taxCountry: 'DE',
					customerVatNumber: 'DE123456789',
					vatTotalCents: 0,
					vatBreakdown: [
						{ kind: 'STANDARD', rate: 0, baseCents: 5000, vatCents: 0 },
					],
					vatValidationStatus: 'UNCHECKED',
				},
			})

			expect(order.taxCountry).toBe('DE')
			expect(order.vatTotalCents).toBe(0)
			expect(order.customerVatNumber).toBe('DE123456789')

			await prisma.order.delete({ where: { id: order.id } })
		})

		test('order with export stores 0% VAT', async () => {
			const order = await prisma.order.create({
				data: {
					orderNumber: 'ORD-TAX-003',
					email: 'export@test.com',
					subtotal: 3000,
					total: 3000,
					shippingName: 'Export Buyer',
					shippingStreet: '789 Export Blvd',
					shippingCity: 'New York',
					shippingPostal: '10001',
					shippingCountry: 'US',
					stripeCheckoutSessionId: `cs_tax_export_${Date.now()}`,
					taxCountry: 'US',
					vatTotalCents: 0,
					vatBreakdown: [],
					vatValidationStatus: 'UNCHECKED',
				},
			})

			expect(order.taxCountry).toBe('US')
			expect(order.vatTotalCents).toBe(0)
				expect(order.vatBreakdown).toEqual([])

			await prisma.order.delete({ where: { id: order.id } })
		})
	})

	describe('createInvoiceForOrder', () => {
		let orderId: string
		let subtotalCents = 10000
		let totalCents = 12000
		let vatCalculation = {
			breakdown: [
				{ kind: 'STANDARD', rate: 2000, baseCents: 10000, vatCents: 2000 },
			],
			totalVatCents: 2000,
			taxCountry: 'FR' as string | null,
		}

		beforeEach(async () => {
			// Create a test order
			const order = await prisma.order.create({
				data: {
					orderNumber: `ORD-INV-${Date.now()}`,
					email: 'invoice-test@example.com',
					subtotal: subtotalCents,
					total: totalCents,
					shippingName: 'Invoice Test',
					shippingStreet: '123 Invoice St',
					shippingCity: 'Paris',
					shippingPostal: '75001',
					shippingCountry: 'FR',
					stripeCheckoutSessionId: `cs_inv_test_${Date.now()}`,
				},
			})
			orderId = order.id
		})

		afterEach(async () => {
			await prisma.invoice.deleteMany({ where: { orderId } })
			await prisma.orderItem.deleteMany({ where: { orderId } })
			await prisma.order.deleteMany({ where: { id: orderId } })
		})

		test('should create an invoice with correct fiscal year and financial data', async () => {
			const result = await prisma.$transaction(async (tx) => {
				return createInvoiceForOrder(tx, orderId, subtotalCents, totalCents, vatCalculation)
			})

			expect(result.id).toBeTruthy()
		expect(result.invoiceNumber).toMatch(/^F\\d{4}-\\d{5}$/)

			// Verify persisted invoice
			const invoice = await prisma.invoice.findFirst({ where: { orderId } })
			expect(invoice).toBeTruthy()
			expect(invoice!.fiscalYear).toBe(new Date().getFullYear())
			expect(invoice!.subtotalCents).toBe(subtotalCents)
			expect(invoice!.totalCents).toBe(totalCents)
			expect(invoice!.vatTotalCents).toBe(2000)
			expect(invoice!.kind).toBe('INVOICE')
			expect(invoice!.status).toBe('DRAFT')

			// Verify VAT breakdown
			const breakdown = invoice!.vatBreakdown as any[]
			expect(breakdown).toHaveLength(1)
			expect(breakdown[0]).toEqual({ kind: 'STANDARD', rate: 2000, baseCents: 10000, vatCents: 2000 })
		})

		test('should be idempotent (calling twice returns same invoice)', async () => {
			let result1: { id: string; invoiceNumber: string }
			let result2: { id: string; invoiceNumber: string }

			await prisma.$transaction(async (tx) => {
				result1 = await createInvoiceForOrder(tx, orderId, subtotalCents, totalCents, vatCalculation)
			})

			await prisma.$transaction(async (tx) => {
				result2 = await createInvoiceForOrder(tx, orderId, subtotalCents, totalCents, vatCalculation)
			})

			expect(result1!.id).toBe(result2!.id)
			expect(result1!.invoiceNumber).toBe(result2!.invoiceNumber)

			// Only one invoice should exist
			const invoices = await prisma.invoice.findMany({ where: { orderId } })
			expect(invoices).toHaveLength(1)
		})

		test('should generate sequential invoice numbers across orders', async () => {
			// Create a second order
			const order2 = await prisma.order.create({
				data: {
					orderNumber: `ORD-INV2-${Date.now()}`,
					email: 'invoice-test2@example.com',
					subtotal: 5000,
					total: 6000,
					shippingName: 'Invoice Test 2',
					shippingStreet: '456 Order St',
					shippingCity: 'Lyon',
					shippingPostal: '69001',
					shippingCountry: 'FR',
					stripeCheckoutSessionId: `cs_inv_test2_${Date.now()}`,
				},
			})

			let num1: string, num2: string

			await prisma.$transaction(async (tx) => {
				const r = await createInvoiceForOrder(tx, orderId, subtotalCents, totalCents, vatCalculation)
				num1 = r.invoiceNumber
			})

			await prisma.$transaction(async (tx) => {
				const r = await createInvoiceForOrder(tx, order2.id, 5000, 6000, {
					breakdown: [{ kind: 'STANDARD', rate: 2000, baseCents: 5000, vatCents: 1000 }],
					totalVatCents: 1000,
					taxCountry: 'FR',
				})
				num2 = r.invoiceNumber
			})

			expect(num1!).not.toBe(num2!)

			// Parse sequences — second should be first + 1
			const parsed1 = parseInvoiceNumber(num1!)
			const parsed2 = parseInvoiceNumber(num2!)
			expect(parsed2!.sequence).toBe(parsed1!.sequence + 1)

			// Cleanup second order
			await prisma.invoice.deleteMany({ where: { orderId: order2.id } })
			await prisma.order.delete({ where: { id: order2.id } })
		})

		test('should create invoice with zero VAT for export orders', async () => {
			const exportVat = {
				breakdown: [] as Array<{ kind: string; rate: number; baseCents: number; vatCents: number }>,
				totalVatCents: 0,
				taxCountry: 'US' as string | null,
			}

			await prisma.$transaction(async (tx) => {
				await createInvoiceForOrder(tx, orderId, 10000, 10000, exportVat)
			})

			const invoice = await prisma.invoice.findFirst({ where: { orderId } })
			expect(invoice).toBeTruthy()
			expect(invoice!.vatTotalCents).toBe(0)
			expect(invoice!.vatBreakdown).toEqual([])
		})

		test('should create invoice with multiple VAT rates', async () => {
			const multiVat = {
				breakdown: [
					{ kind: 'STANDARD', rate: 2000, baseCents: 5000, vatCents: 1000 },
					{ kind: 'REDUCED', rate: 1000, baseCents: 2000, vatCents: 200 },
				],
				totalVatCents: 1200,
				taxCountry: 'FR' as string | null,
			}

			await prisma.$transaction(async (tx) => {
				await createInvoiceForOrder(tx, orderId, 7000, 8200, multiVat)
			})

			const invoice = await prisma.invoice.findFirst({ where: { orderId } })
			expect(invoice).toBeTruthy()
			expect(invoice!.vatTotalCents).toBe(1200)

			const breakdown = invoice!.vatBreakdown as any[]
			expect(breakdown).toHaveLength(2)
			expect(breakdown[0]).toEqual({ kind: 'STANDARD', rate: 2000, baseCents: 5000, vatCents: 1000 })
			expect(breakdown[1]).toEqual({ kind: 'REDUCED', rate: 1000, baseCents: 2000, vatCents: 200 })
		})
	})


describe('getAdminOrders', () => {
	let testPrefix: string

	beforeEach(async () => {
		testPrefix = `getadminorders-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	})

	afterEach(async () => {
		if (!testPrefix) return
		try {
			await prisma.orderItem.deleteMany({
				where: { order: { stripeCheckoutSessionId: { startsWith: testPrefix } } },
			})
		} catch {}
		try {
			await prisma.order.deleteMany({
				where: { stripeCheckoutSessionId: { startsWith: testPrefix } },
			})
		} catch {}
	})

	async function createTestOrder(
		index: number,
		overrides: Partial<{
			status: string
			email: string
			createdAt: Date
		}> = {},
	) {
		return prisma.order.create({
			data: {
				orderNumber: `${testPrefix}-${index}`,
				email: overrides.email ?? `customer${index}@example.com`,
				subtotal: 1000 * index,
				total: 1000 * index,
				shippingName: `Customer ${index}`,
				shippingStreet: `${index} Test St`,
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: (overrides.status as any) ?? 'CONFIRMED',
				stripeCheckoutSessionId: `${testPrefix}-session-${index}`,
				createdAt: overrides.createdAt ?? new Date(`2026-01-${String(index).padStart(2, '0')}T12:00:00.000Z`),
			},
		})
	}

	test('returns paginated orders with default parameters', async () => {
		await createTestOrder(1)
		await createTestOrder(2)

		const result = await getAdminOrders({})

		expect(result.orders).toHaveLength(2)
		expect(result.total).toBe(2)
		expect(result.page).toBe(1)
		expect(result.perPage).toBe(25)
		expect(result.totalPages).toBe(1)
		// Default order is by createdAt desc — most recent first
		expect(result.orders[0]!.orderNumber).toBe(`${testPrefix}-2`)
		expect(result.orders[1]!.orderNumber).toBe(`${testPrefix}-1`)
	})

	test('paginates with custom page and perPage', async () => {
		// Create 5 orders
		for (let i = 1; i <= 5; i++) {
			await createTestOrder(i)
		}

		const result = await getAdminOrders({ page: 2, perPage: 2 })

		expect(result.orders).toHaveLength(2)
		expect(result.total).toBe(5)
		expect(result.page).toBe(2)
		expect(result.totalPages).toBe(3)
	})

	test('filters by status', async () => {
		await createTestOrder(1, { status: 'CONFIRMED' })
		await createTestOrder(2, { status: 'SHIPPED' })
		await createTestOrder(3, { status: 'CONFIRMED' })

		const result = await getAdminOrders({ status: 'SHIPPED' })

		expect(result.orders).toHaveLength(1)
		expect(result.total).toBe(1)
		expect(result.orders[0]!.orderNumber).toBe(`${testPrefix}-2`)
	})

	test('filters by status "all" returns everything', async () => {
		await createTestOrder(1, { status: 'CONFIRMED' })
		await createTestOrder(2, { status: 'SHIPPED' })

		const result = await getAdminOrders({ status: 'all' })

		expect(result.total).toBe(2)
	})

	test('searches by order number', async () => {
		await createTestOrder(1)
		await createTestOrder(2)
		await createTestOrder(10) // different pattern

		const result = await getAdminOrders({ search: `${testPrefix}-1` })

		expect(result.total).toBe(2) // matches both -1 and -10
	})

	test('searches by email', async () => {
		await createTestOrder(1, { email: 'alice@example.com' })
		await createTestOrder(2, { email: 'bob@example.com' })

		const result = await getAdminOrders({ search: 'alice' })

		expect(result.total).toBe(1)
		expect(result.orders[0]!.email).toBe('alice@example.com')
	})

	test('searches by user email', async () => {
		const user = await prisma.user.create({
			data: {
				email: `search-user-${testPrefix}@example.com`,
				username: `search-user-${testPrefix}`,
			},
		})

		await prisma.order.create({
			data: {
				orderNumber: `${testPrefix}-user-search`,
				email: 'different@example.com',
				subtotal: 1000,
				total: 1000,
				shippingName: 'Test',
				shippingStreet: '1 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${testPrefix}-session-user`,
				userId: user.id,
			},
		})

		const result = await getAdminOrders({ search: `search-user-${testPrefix}` })

		expect(result.total).toBe(1)
		expect(result.orders[0]!.orderNumber).toBe(`${testPrefix}-user-search`)

		// Cleanup
		await prisma.order.deleteMany({ where: { stripeCheckoutSessionId: `${testPrefix}-session-user` } })
		await prisma.user.deleteMany({ where: { id: user.id } })
	})

	test('filters by date range', async () => {
		await createTestOrder(1, { createdAt: new Date('2026-01-01T12:00:00.000Z') })
		await createTestOrder(2, { createdAt: new Date('2026-01-15T12:00:00.000Z') })
		await createTestOrder(3, { createdAt: new Date('2026-02-01T12:00:00.000Z') })

		const result = await getAdminOrders({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })

		expect(result.total).toBe(2)
	})

	test('filters by dateFrom only', async () => {
		await createTestOrder(1, { createdAt: new Date('2026-01-01T12:00:00.000Z') })
		await createTestOrder(2, { createdAt: new Date('2026-02-15T12:00:00.000Z') })

		const result = await getAdminOrders({ dateFrom: '2026-02-01' })

		expect(result.total).toBe(1)
		expect(result.orders[0]!.orderNumber).toBe(`${testPrefix}-2`)
	})

	test('filters by dateTo only', async () => {
		await createTestOrder(1, { createdAt: new Date('2026-01-01T12:00:00.000Z') })
		await createTestOrder(2, { createdAt: new Date('2026-02-15T12:00:00.000Z') })

		const result = await getAdminOrders({ dateTo: '2026-01-31' })

		expect(result.total).toBe(1)
		expect(result.orders[0]!.orderNumber).toBe(`${testPrefix}-1`)
	})

	test('combines status + search + date filters', async () => {
		await createTestOrder(1, { status: 'CONFIRMED', email: 'alice@example.com', createdAt: new Date('2026-01-10T12:00:00.000Z') })
		await createTestOrder(2, { status: 'SHIPPED', email: 'alice@example.com', createdAt: new Date('2026-01-10T12:00:00.000Z') })
		await createTestOrder(3, { status: 'CONFIRMED', email: 'bob@example.com', createdAt: new Date('2026-02-10T12:00:00.000Z') })

		const result = await getAdminOrders({
			status: 'CONFIRMED',
			search: 'alice',
			dateFrom: '2026-01-01',
			dateTo: '2026-01-31',
		})

		expect(result.total).toBe(1)
		expect(result.orders[0]!.orderNumber).toBe(`${testPrefix}-1`)
	})

	test('handles empty result set', async () => {
		const result = await getAdminOrders({ search: 'nonexistent' })

		expect(result.orders).toHaveLength(0)
		expect(result.total).toBe(0)
		expect(result.totalPages).toBe(0)
	})

	test('clamps invalid page to 1', async () => {
		await createTestOrder(1)
		const result = await getAdminOrders({ page: 0 })
		// page: 0 is clamped to 1 inside the function, so skip = 0
		expect(result.total).toBe(1)
		expect(result.page).toBe(1)
	})

	test('handles empty search string gracefully', async () => {
		await createTestOrder(1)
		const result = await getAdminOrders({ search: '  ' })
		expect(result.total).toBe(1)
	})
})
