import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	getProductReviewAggregate,
	getProductReviewAggregates,
	type ReviewAggregate,
} from './review-aggregate.server.ts'

// ─── Test Helpers ─────────────────────────────────────────────────────────

async function createTestProduct(name: string, slug: string) {
	return await prisma.product.create({
		data: {
			name,
			slug,
			sku: `SKU-${slug}`,
			price: 1999,
			status: 'ACTIVE',
		},
	})
}

async function createReview(
	productId: string,
	rating: number,
	isApproved = true,
) {
	return await prisma.review.create({
		data: {
			productId,
			rating,
			isApproved,
		},
	})
}

async function cleanupTestData() {
	await prisma.review.deleteMany()
	await prisma.productImage.deleteMany()
	await prisma.productToTag.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
}

// ─── Expected Distribution Shape ──────────────────────────────────────────

const emptyDistribution: [number, number, number, number, number] = [
	0, 0, 0, 0, 0,
]

// ─── Tests: getProductReviewAggregate ─────────────────────────────────────

describe('getProductReviewAggregate', () => {
	beforeEach(async () => {
		await cleanupTestData()
	})

	it('returns null average and zero counts when no reviews exist', async () => {
		const product = await createTestProduct('No Reviews', 'no-reviews')
		const result = await getProductReviewAggregate(product.id)

		expect(result).toEqual<ReviewAggregate>({
			averageRating: null,
			distribution: emptyDistribution,
			totalCount: 0,
		})
	})

	it('returns correct average for 5, 4, 3 star reviews → 4.0', async () => {
		const product = await createTestProduct('Test Product', 'test-product')
		await createReview(product.id, 5)
		await createReview(product.id, 4)
		await createReview(product.id, 3)

		const result = await getProductReviewAggregate(product.id)

		expect(result.averageRating).toBeCloseTo(4.0, 1)
		expect(result.totalCount).toBe(3)
		expect(result.distribution).toEqual<[number, number, number, number, number]>([0, 0, 1, 1, 1])
	})

	it('excludes unapproved reviews from aggregates', async () => {
		const product = await createTestProduct('Unapproved', 'unapproved')
		await createReview(product.id, 5, true) // approved
		await createReview(product.id, 1, false) // unapproved
		await createReview(product.id, 4, false) // unapproved

		const result = await getProductReviewAggregate(product.id)

		expect(result.totalCount).toBe(1)
		expect(result.averageRating).toBeCloseTo(5.0, 1)
		expect(result.distribution).toEqual<[number, number, number, number, number]>([0, 0, 0, 0, 1])
	})

	it('handles single review correctly', async () => {
		const product = await createTestProduct('Single', 'single')
		await createReview(product.id, 3)

		const result = await getProductReviewAggregate(product.id)

		expect(result.averageRating).toBeCloseTo(3.0, 1)
		expect(result.totalCount).toBe(1)
		expect(result.distribution).toEqual<[number, number, number, number, number]>([0, 0, 1, 0, 0])
	})

	it('handles all 5-star reviews', async () => {
		const product = await createTestProduct('All 5', 'all-5')
		await createReview(product.id, 5)
		await createReview(product.id, 5)
		await createReview(product.id, 5)

		const result = await getProductReviewAggregate(product.id)

		expect(result.averageRating).toBeCloseTo(5.0, 1)
		expect(result.totalCount).toBe(3)
		expect(result.distribution).toEqual<[number, number, number, number, number]>([0, 0, 0, 0, 3])
	})

	it('handles mixed distribution of all ratings', async () => {
		const product = await createTestProduct('Mixed', 'mixed')
		// 1×1, 2×2, 3×3, 2×4, 1×5
		await createReview(product.id, 1)
		await createReview(product.id, 2)
		await createReview(product.id, 2)
		await createReview(product.id, 3)
		await createReview(product.id, 3)
		await createReview(product.id, 3)
		await createReview(product.id, 4)
		await createReview(product.id, 4)
		await createReview(product.id, 5)

		const result = await getProductReviewAggregate(product.id)

		// Average: (1 + 2*2 + 3*3 + 2*4 + 5) / 9 = (1+4+9+8+5)/9 = 27/9 = 3.0
		expect(result.averageRating).toBeCloseTo(3.0, 1)
		expect(result.totalCount).toBe(9)
		expect(result.distribution).toEqual<[number, number, number, number, number]>([1, 2, 3, 2, 1])
	})
})

// ─── Tests: getProductReviewAggregates (batch) ────────────────────────────

describe('getProductReviewAggregates', () => {
	beforeEach(async () => {
		await cleanupTestData()
	})

	it('returns empty map for empty productIds array', async () => {
		const result = await getProductReviewAggregates([])
		expect(result.size).toBe(0)
	})

	it('returns aggregates for multiple products', async () => {
		const p1 = await createTestProduct('Product A', 'product-a')
		const p2 = await createTestProduct('Product B', 'product-b')
		const p3 = await createTestProduct('Product C', 'product-c')

		// p1: two reviews (5, 3)
		await createReview(p1.id, 5)
		await createReview(p1.id, 3)

		// p2: one review (4)
		await createReview(p2.id, 4)

		// p3: zero reviews

		const result = await getProductReviewAggregates([p1.id, p2.id, p3.id])

		expect(result.size).toBe(3)

		// p1
		expect(result.get(p1.id)?.averageRating).toBeCloseTo(4.0, 1)
		expect(result.get(p1.id)?.totalCount).toBe(2)

		// p2
		expect(result.get(p2.id)?.averageRating).toBeCloseTo(4.0, 1)
		expect(result.get(p2.id)?.totalCount).toBe(1)

		// p3
		expect(result.get(p3.id)?.averageRating).toBeNull()
		expect(result.get(p3.id)?.totalCount).toBe(0)
	})

	it('only counts approved reviews in batch', async () => {
		const p1 = await createTestProduct('With Unapproved', 'with-unapproved')
		await createReview(p1.id, 5, true)
		await createReview(p1.id, 1, false)
		await createReview(p1.id, 3, true)

		const result = await getProductReviewAggregates([p1.id])

		expect(result.get(p1.id)?.totalCount).toBe(2)
		expect(result.get(p1.id)?.averageRating).toBeCloseTo(4.0, 1)
		expect(result.get(p1.id)?.distribution).toEqual<[number, number, number, number, number]>([0, 0, 1, 0, 1])
	})
})
