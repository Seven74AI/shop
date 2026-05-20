import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from './db.server.ts'
import {
	createReview,
	getProductReviews,
	getProductRatingStats,
	getAllReviews,
	updateReviewStatus,
	deleteReview,
} from './reviews.server.ts'

describe('Admin review management', () => {
	let testUser: { id: string }
	let testProduct: { id: string }
	let testOrder: { id: string }

	beforeEach(async () => {
		// Create test user
		const user = await prisma.user.upsert({
			where: { email: 'review-test@example.com' },
			update: {},
			create: {
				email: 'review-test@example.com',
				username: `review-test-${Date.now()}`,
			},
		})
		testUser = { id: user.id }

		// Create test category
		const category = await prisma.category.upsert({
			where: { slug: 'review-test-category' },
			update: {},
			create: {
				name: 'Review Test Category',
				slug: 'review-test-category',
			},
		})

		// Create test product
		const timestamp = Date.now()
		const product = await prisma.product.create({
			data: {
				name: `Review Test Product ${timestamp}`,
				slug: `review-test-product-${timestamp}`,
				sku: `REVIEW-TEST-${timestamp}`,
				price: 1999,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})
		testProduct = { id: product.id }

		// Create test order
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-REVIEW-${timestamp}`,
				email: 'review-test@example.com',
				userId: user.id,
				subtotal: 1999,
				total: 1999,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				stripeCheckoutSessionId: `cs_review_test_${timestamp}`,
				status: 'CONFIRMED',
			},
		})
		testOrder = { id: order.id }

		// Clean up any existing reviews
		await prisma.review.deleteMany({
			where: { productId: product.id },
		})
	})

	afterEach(async () => {
		await prisma.review.deleteMany({
			where: { productId: testProduct.id },
		})
		await prisma.orderItem.deleteMany({
			where: { orderId: testOrder.id },
		})
		await prisma.order.deleteMany({
			where: { id: testOrder.id },
		})
		await prisma.product.deleteMany({
			where: { id: testProduct.id },
		})
	})

	test('createReview sets status to PENDING (not auto-approved)', async () => {
		const review = await createReview({
			userId: testUser.id,
			productId: testProduct.id,
			rating: 4,
			title: 'Great product',
			body: 'Really enjoyed this product, would recommend!',
		})

		expect(review.status).toBe('PENDING')
		expect(review.rating).toBe(4)
		expect(review.title).toBe('Great product')
	})

	test('getAllReviews returns all reviews with default sorting', async () => {
		// Create reviews with different statuses
		await createReview({
			userId: testUser.id,
			productId: testProduct.id,
			rating: 5,
			body: 'Excellent!',
		})

		// Create a second user for another review
		const user2 = await prisma.user.create({
			data: {
				email: `review-test-2-${Date.now()}@example.com`,
				username: `review-test-2-${Date.now()}`,
			},
		})

		await prisma.review.create({
			data: {
				productId: testProduct.id,
				userId: user2.id,
				rating: 3,
				body: 'Just ok.',
				status: 'APPROVED',
			},
		})

		const result = await getAllReviews()
		const reviews = result.reviews
		const testReviews = reviews.filter(
			(r) => r.productId === testProduct.id,
		)
		expect(testReviews.length).toBe(2)
		// Most recent first
		expect(testReviews[0]!.status).toBe('APPROVED')
	})

	test('getAllReviews filters by status', async () => {
		await createReview({
			userId: testUser.id,
			productId: testProduct.id,
			rating: 5,
			body: 'Excellent!',
		})

		const user2 = await prisma.user.create({
			data: {
				email: `review-test-3-${Date.now()}@example.com`,
				username: `review-test-3-${Date.now()}`,
			},
		})

		await prisma.review.create({
			data: {
				productId: testProduct.id,
				userId: user2.id,
				rating: 1,
				body: 'Terrible.',
				status: 'REJECTED',
			},
		})

		const pendingResult = await getAllReviews({ status: 'PENDING' })
		const pendingReviews = pendingResult.reviews
		const testPending = pendingReviews.filter(
			(r) => r.productId === testProduct.id,
		)
		const allResult = await getAllReviews()
		const allReviews = allResult.reviews
		const testAll = allReviews.filter(
			(r) => r.productId === testProduct.id,
		)

		expect(testPending.length).toBe(1)
		expect(testPending[0]!.status).toBe('PENDING')
		expect(testAll.length).toBe(2)
	})

	test('updateReviewStatus approves a review', async () => {
		const review = await createReview({
			userId: testUser.id,
			productId: testProduct.id,
			rating: 4,
			body: 'Good product.',
		})

		expect(review.status).toBe('PENDING')

		const updated = await updateReviewStatus(review.id, 'APPROVED')
		expect(updated.status).toBe('APPROVED')

		// Verify in DB
		const dbReview = await prisma.review.findUnique({
			where: { id: review.id },
		})
		expect(dbReview?.status).toBe('APPROVED')
	})

	test('updateReviewStatus rejects a review', async () => {
		const review = await createReview({
			userId: testUser.id,
			productId: testProduct.id,
			rating: 2,
			body: 'Spam spam spam!',
		})

		const updated = await updateReviewStatus(review.id, 'REJECTED')
		expect(updated.status).toBe('REJECTED')
	})

	test('deleteReview removes a review', async () => {
		const review = await createReview({
			userId: testUser.id,
			productId: testProduct.id,
			rating: 3,
			body: 'Meh.',
		})

		await deleteReview(review.id)

		const dbReview = await prisma.review.findUnique({
			where: { id: review.id },
		})
		expect(dbReview).toBeNull()
	})

	test('getProductReviews only returns APPROVED reviews', async () => {
		const review1 = await createReview({
			userId: testUser.id,
			productId: testProduct.id,
			rating: 5,
			body: 'Great!',
		})

		// Approve it
		await updateReviewStatus(review1.id, 'APPROVED')

		// Create another pending review from different user
		const user2 = await prisma.user.create({
			data: {
				email: `review-test-4-${Date.now()}@example.com`,
				username: `review-test-4-${Date.now()}`,
			},
		})
		await prisma.review.create({
			data: {
				productId: testProduct.id,
				userId: user2.id,
				rating: 1,
				body: 'Bad!',
				status: 'PENDING',
			},
		})

		const reviews = await getProductReviews(testProduct.id)
		expect(reviews.length).toBe(1)
		expect(reviews[0]!.status).toBe('APPROVED')
	})

	test('getProductRatingStats only counts APPROVED reviews', async () => {
		const review1 = await createReview({
			userId: testUser.id,
			productId: testProduct.id,
			rating: 5,
			body: 'Great!',
		})
		await updateReviewStatus(review1.id, 'APPROVED')

		const user2 = await prisma.user.create({
			data: {
				email: `review-test-5-${Date.now()}@example.com`,
				username: `review-test-5-${Date.now()}`,
			},
		})
		await prisma.review.create({
			data: {
				productId: testProduct.id,
				userId: user2.id,
				rating: 1,
				body: 'Great product.', // same text, different user
				status: 'PENDING',
			},
		})

		const stats = await getProductRatingStats(testProduct.id)
		expect(stats.reviewCount).toBe(1)
		expect(stats.averageRating).toBe(5.0)
	})
})
