import { faker } from '@faker-js/faker'
import { describe, expect, test, beforeEach } from 'vitest'
import { prisma } from './db.server.ts'
import { submitReview } from './review.server.ts'
import { createProductData } from '#tests/product-utils.ts'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'

let userId: string
let productId: string

beforeEach(async () => {
	// Create a fresh test user
	const user = await prisma.user.create({
		data: {
			username: faker.string.alphanumeric({ length: 10 }).toLowerCase(),
			email: `${faker.string.alphanumeric(8)}@test.com`,
		},
		select: { id: true },
	})
	userId = user.id

	// Create a test product with all required fields
	const productData = createProductData()
	const product = await prisma.product.create({
		data: {
			name: productData.name,
			slug: productData.slug,
			sku: productData.sku,
			price: productData.price,
			categoryId: productData.categoryId ?? UNCATEGORIZED_CATEGORY_ID,
		},
		select: { id: true },
	})
	productId = product.id
})

/**
 * Helper: create a minimal completed order for the test user + product.
 */
async function createTestOrder({
	status = 'CONFIRMED',
}: { status?: 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' } = {}) {
	const price = 2999
	const orderNumber = await generateOrderNumber()
	return prisma.order.create({
		data: {
			orderNumber,
			userId,
			email: 'test@example.com',
			subtotal: price,
			total: price,
			shippingName: 'Test User',
			shippingStreet: '123 Main St',
			shippingCity: 'Test City',
			shippingPostal: '12345',
			shippingCountry: 'US',
			stripeCheckoutSessionId: `cs_test_${Date.now()}_${faker.string.alphanumeric(6)}`,
			status,
			items: {
				create: {
					productId,
					price,
					quantity: 1,
				},
			},
		},
		select: { id: true },
	})
}

describe('submitReview', () => {
	test('creates a review with valid input (unverified purchase)', async () => {
		const result = await submitReview({
			userId,
			productId,
			rating: 4,
			title: 'Great product!',
			body: 'I really enjoyed this product. Would recommend to anyone.',
		})

		expect(result.review).toBeDefined()
		expect(result.review.rating).toBe(4)
		expect(result.review.title).toBe('Great product!')
		expect(result.review.body).toBe(
			'I really enjoyed this product. Would recommend to anyone.',
		)
		expect(result.review.isVerifiedPurchase).toBe(false)
		expect(result.review.isApproved).toBe(false)
	})

	test('sets isVerifiedPurchase when user has a completed order', async () => {
		const order = await createTestOrder()

		const result = await submitReview({
			userId,
			productId,
			rating: 5,
			title: 'Verified buyer!',
			body: 'Bought this and loved it. Great quality product.',
			orderId: order.id,
		})

		expect(result.review.isVerifiedPurchase).toBe(true)
		expect(result.review.orderId).toBe(order.id)
	})

	test('sets isVerifiedPurchase when user has a completed order containing the product (no orderId given)', async () => {
		await createTestOrder({ status: 'SHIPPED' })

		const result = await submitReview({
			userId,
			productId,
			rating: 3,
			title: 'Decent product',
			body: 'It works OK, nothing special though.',
		})

		expect(result.review.isVerifiedPurchase).toBe(true)
	})

	test('rejects duplicate review from same user+product', async () => {
		await submitReview({
			userId,
			productId,
			rating: 4,
			title: 'First review',
			body: 'This is my first review of the product.',
		})

		await expect(
			submitReview({
				userId,
				productId,
				rating: 3,
				title: 'Second review',
				body: 'Trying to leave another review.',
			}),
		).rejects.toThrow('already reviewed')
	})

	test('rejects rating below 1', async () => {
		await expect(
			submitReview({
				userId,
				productId,
				rating: 0,
				title: 'Test title',
				body: 'This is a test body that is long enough.',
			}),
		).rejects.toThrow('Validation failed')
	})

	test('rejects rating above 5', async () => {
		await expect(
			submitReview({
				userId,
				productId,
				rating: 6,
				title: 'Test title',
				body: 'This is a test body that is long enough.',
			}),
		).rejects.toThrow('Validation failed')
	})

	test('rejects title below minimum length (4 chars)', async () => {
		await expect(
			submitReview({
				userId,
				productId,
				rating: 3,
				title: 'Good',
				body: 'This is a test body that is long enough.',
			}),
		).rejects.toThrow('Validation failed')
	})

	test('rejects body below minimum length (19 chars)', async () => {
		await expect(
			submitReview({
				userId,
				productId,
				rating: 4,
				title: 'Great product!',
				body: 'Too short',
			}),
		).rejects.toThrow('Validation failed')
	})

	test('rejects non-existent product', async () => {
		await expect(
			submitReview({
				userId,
				productId: 'non-existent-product-id',
				rating: 4,
				title: 'Great product!',
				body: 'This is a test body that is long enough.',
			}),
		).rejects.toThrow('Product not found')
	})

	test('accepts review at boundary values (min title, min body)', async () => {
		const result = await submitReview({
			userId,
			productId,
			rating: 3,
			title: 'Good!',
			body: 'Exactly twenty chars!!',
		})

		expect(result.review.rating).toBe(3)
		expect(result.review.title).toBe('Good!')
		expect(result.review.body).toBe('Exactly twenty chars!!')
	})
})
