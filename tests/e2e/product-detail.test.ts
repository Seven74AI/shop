import { randomUUID } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

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

