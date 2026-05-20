import { randomUUID } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

interface JsonLdProduct {
	'@context': string
	'@type': string
	name: string
	sku: string
	offers: {
		'@type': string
		price: string
		priceCurrency: string
		availability: string
	}
	description?: string
	image?: string
	aggregateRating?: {
		'@type': string
		ratingValue: number
		reviewCount: number
		bestRating: number
		worstRating: number
	}
}

test.describe('Product Detail', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>

	test.beforeEach(async () => {
		// Use randomUUID for slug - Date.now() can collide when tests run in parallel
		const uniqueId = randomUUID().slice(0, 8)
		testCategory = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${uniqueId}`,
				description: 'Test category for products',
			},
		})
	})

	test('should display product details', async ({ page }) => {
		// Ensure testCategory exists (created in beforeEach)
		if (!testCategory?.id) {
			throw new Error('testCategory was not created in beforeEach')
		}

		// Create a test product
		const productData = createProductData()
		productData.status = 'ACTIVE'

		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)

		// Check product name is visible
		await expect(page.getByRole('heading', { name: product.name })).toBeVisible()

		// Check product price is visible (price is now in cents)
		await expect(page.getByText(`$${(product.price / 100).toFixed(2)}`)).toBeVisible()

		// Check product description is visible
		await expect(page.getByText(product.description!)).toBeVisible()
	})

	test('should allow adding product without variants to cart', async ({ page }) => {
		
		// Ensure testCategory exists (created in beforeEach)
		if (!testCategory?.id) {
			throw new Error('testCategory was not created in beforeEach')
		}

		// Create a test product without variants - use unique slug/sku to avoid 404 when tests run in parallel
		// (createProductData can collide across workers since UniqueEnforcer is per-process)
		const productData = createProductData()
		productData.status = 'ACTIVE'
		const uniqueId = randomUUID().slice(0, 8)
		const uniqueSlug = `${productData.slug}-${uniqueId}`
		const uniqueSku = `${productData.sku}-${uniqueId}`

		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: uniqueSlug,
				description: productData.description,
				sku: uniqueSku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)
		await expect(page.getByRole('heading', { name: product.name })).toBeVisible({ timeout: 10000 })

		// Find and click add to cart button - wait for redirect (form POST)
		const addToCartButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addToCartButton).toBeVisible({ timeout: 10000 })
		await Promise.all([
			page.waitForURL(/\/shop\/cart/, { timeout: 15000 }),
			addToCartButton.click(),
		])
	})

	test.describe('JSON-LD structured data', () => {
		test('should include Product JSON-LD without aggregateRating when no reviews exist', async ({
			page,
		}) => {
			// Ensure testCategory exists (created in beforeEach)
			if (!testCategory?.id) {
				throw new Error('testCategory was not created in beforeEach')
			}

			// Create a test product without reviews
			const productData = createProductData()
			const uniqueId = randomUUID().slice(0, 8)

			const product = await prisma.product.create({
				data: {
					name: productData.name,
					slug: `${productData.slug}-${uniqueId}`,
					description: productData.description,
					sku: `${productData.sku}-${uniqueId}`,
					price: productData.price,
					status: 'ACTIVE',
					categoryId: testCategory.id,
				},
			})

			await page.goto(`/shop/products/${product.slug}`)

			// Check JSON-LD script tag exists
			const jsonLdScript = page.locator('script[type="application/ld+json"]')
			await expect(jsonLdScript).toBeAttached({ timeout: 10000 })

			const jsonContent = await jsonLdScript.textContent()
			const parsed = JSON.parse(jsonContent!) as JsonLdProduct

			// Verify basic Product schema
			expect(parsed['@context']).toBe('https://schema.org')
			expect(parsed['@type']).toBe('Product')
			expect(parsed.name).toBe(product.name)
			expect(parsed.sku).toBe(product.sku)
			expect(parsed.offers['@type']).toBe('Offer')
			expect(parsed.offers.priceCurrency).toBe('USD')

			// AggregateRating should NOT be present (no reviews)
			expect(parsed.aggregateRating).toBeUndefined()
		})

		test('should include aggregateRating in JSON-LD when reviews exist', async ({
			page,
		}) => {
			// Ensure testCategory exists (created in beforeEach)
			if (!testCategory?.id) {
				throw new Error('testCategory was not created in beforeEach')
			}

			const uniqueId = randomUUID().slice(0, 8)
			const productData = createProductData()

			const product = await prisma.product.create({
				data: {
					name: productData.name,
					slug: `${productData.slug}-${uniqueId}`,
					description: productData.description,
					sku: `${productData.sku}-${uniqueId}`,
					price: productData.price,
					status: 'ACTIVE',
					categoryId: testCategory.id,
				},
			})

			// Create two test users (unique constraint: one review per user per product)
			const user1 = await prisma.user.create({
				data: {
					username: `testuser-a-${uniqueId}`,
					email: `testuser-a-${uniqueId}@example.com`,
					name: 'Reviewer One',
					roles: { connect: { name: 'user' } },
				},
			})
			const user2 = await prisma.user.create({
				data: {
					username: `testuser-b-${uniqueId}`,
					email: `testuser-b-${uniqueId}@example.com`,
					name: 'Reviewer Two',
					roles: { connect: { name: 'user' } },
				},
			})

			// Create reviews with ratings 4 and 5 (avg = 4.5)
			await prisma.review.createMany({
				data: [
					{
						productId: product.id,
						userId: user1.id,
						rating: 4,
						title: 'Good product',
						body: 'I enjoyed this product.',
						status: 'APPROVED',
					},
					{
						productId: product.id,
						userId: user2.id,
						rating: 5,
						title: 'Great!',
						body: 'Excellent!',
						status: 'APPROVED',
					},
				],
			})

			await page.goto(`/shop/products/${product.slug}`)

			// Check JSON-LD script tag exists
			const jsonLdScript = page.locator('script[type="application/ld+json"]')
			await expect(jsonLdScript).toBeAttached({ timeout: 10000 })

			const jsonContent = await jsonLdScript.textContent()
			const parsed = JSON.parse(jsonContent!) as JsonLdProduct

			// Verify Product schema
			expect(parsed['@context']).toBe('https://schema.org')
			expect(parsed['@type']).toBe('Product')

			// Verify aggregateRating is present
			expect(parsed.aggregateRating).toBeDefined()
			const agg = parsed.aggregateRating!
			expect(agg['@type']).toBe('AggregateRating')
			expect(agg.reviewCount).toBe(2)
			expect(agg.ratingValue).toBe(4.5)
			expect(agg.bestRating).toBe(5)
			expect(agg.worstRating).toBe(1)
		})
	})

	test.afterEach(async () => {
		// Scoped cleanup: only delete products in OUR category (not SKU-* which matches all tests!)
		const categoryId = testCategory?.id
		if (!categoryId) return

		await prisma.$transaction([
			prisma.orderItem.deleteMany({
				where: { product: { categoryId } },
			}),
			prisma.cartItem.deleteMany({
				where: { product: { categoryId } },
			}),
			prisma.product.deleteMany({
				where: { categoryId },
			}),
		])
		await prisma.category.delete({ where: { id: categoryId } }).catch(() => {})

		testCategory = undefined as any
	})
})

