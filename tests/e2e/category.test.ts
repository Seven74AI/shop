import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

const CATEGORY_E2E_PREFIX = 'category-e2e'

function getTestPrefix(testId: string) {
	const hash = createHash('md5').update(testId).digest('hex').slice(0, 8)
	return `${CATEGORY_E2E_PREFIX}-${hash}`
}

test.describe('Category Page', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 })
	test.afterEach(async ({}, testInfo) => {
		// Scoped cleanup - must not delete other tests' data when running in parallel
		// Run individually (not in a transaction) to avoid holding SQLite write locks
		// while the server is still processing page requests (SQLITE_BUSY contention)
		const testPrefix = getTestPrefix(testInfo.testId)
		try { await prisma.orderItem.deleteMany({ where: { product: { category: { slug: { startsWith: testPrefix } } } } }) } catch {}
		try { await prisma.cartItem.deleteMany({ where: { product: { category: { slug: { startsWith: testPrefix } } } } }) } catch {}
		try { await prisma.product.deleteMany({ where: { category: { slug: { startsWith: testPrefix } } } }) } catch {}
		try { await prisma.category.deleteMany({ where: { slug: { startsWith: testPrefix } } }) } catch {}
	})

	test('should display products filtered by category', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo.testId)
		const uniqueId = randomUUID().slice(0, 8)
		// Create two test categories
		const category1 = await prisma.category.create({
			data: {
				name: 'Electronics',
				slug: `${testPrefix}-electronics-${uniqueId}`,
			},
		})

		const category2 = await prisma.category.create({
			data: {
				name: 'Clothing',
				slug: `${testPrefix}-clothing-${uniqueId}`,
			},
		})

		// Create products in different categories
		const product1Data = createProductData()
		const product1 = await prisma.product.create({
			data: {
				name: 'Laptop',
				slug: `${product1Data.slug}-${uniqueId}`,
				description: product1Data.description,
				sku: `${testPrefix}-sku-${uniqueId}-1`,
				price: product1Data.price,
				categoryId: category1.id,
				status: 'ACTIVE',
			},
		})

		const product2Data = createProductData()
		const product2 = await prisma.product.create({
			data: {
				name: 'Shirt',
				slug: `${product2Data.slug}-${uniqueId}`,
				description: product2Data.description,
				sku: `${testPrefix}-sku-${uniqueId}-2`,
				price: product2Data.price,
				categoryId: category2.id,
				status: 'ACTIVE',
			},
		})

		// Navigate to category1 page
		await page.goto(`/shop/categories/${category1.slug}`, { timeout: 30_000 })
		await page.waitForURL(`**/categories/${category1.slug}**`)

		// Should show only product1 (from category1)
		await expect(page.getByText(product1.name)).toBeVisible({ timeout: 15_000 })
		await expect(page.getByText(product2.name)).not.toBeVisible({ timeout: 5_000 })

		// Navigate to category2 page
		await page.goto(`/shop/categories/${category2.slug}`, { timeout: 30_000 })
		await page.waitForURL(`**/categories/${category2.slug}**`)

		// Should show only product2 (from category2)
		await expect(page.getByText(product2.name)).toBeVisible({ timeout: 15_000 })
		await expect(page.getByText(product1.name)).not.toBeVisible({ timeout: 5_000 })
	})

	test('should show empty state when category has no products', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo.testId)
		const uniqueId = randomUUID().slice(0, 8)
		// Create empty category with testPrefix for scoped cleanup
		const category = await prisma.category.create({
			data: {
				name: 'Empty Category',
				slug: `${testPrefix}-empty-${uniqueId}`,
			},
		})

		await page.goto(`/shop/categories/${category.slug}`)
		await page.waitForURL(`**/categories/${category.slug}**`)

		// Should show empty state message
		await expect(page.getByText(/no products/i)).toBeVisible({ timeout: 10_000 })
	})

	test('should display category name and description', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo.testId)
		const uniqueId = randomUUID().slice(0, 8)
		// Create category with description
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `${testPrefix}-test-${uniqueId}`,
				description: 'This is a test category description',
			},
		})

		await page.goto(`/shop/categories/${category.slug}`)
		await page.waitForURL(`**/categories/${category.slug}**`)

		// Should show category name and description
		await expect(page.getByRole('heading', { name: category.name })).toBeVisible({ timeout: 10_000 })
		await expect(page.getByText(category.description!)).toBeVisible({ timeout: 10_000 })
	})

	test('should allow filtering by category within category page', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo.testId)
		const uniqueId = randomUUID().slice(0, 8)
		// Create two categories - use testPrefix for scoped cleanup
		const category1 = await prisma.category.create({
			data: {
				name: 'Category A',
				slug: `${testPrefix}-category-a-${uniqueId}`,
			},
		})

		const category2 = await prisma.category.create({
			data: {
				name: 'Category B',
				slug: `${testPrefix}-category-b-${uniqueId}`,
			},
		})

		// Create products in both categories
		const product1Data = createProductData()
		const product1 = await prisma.product.create({
			data: {
				name: 'Product A1',
				slug: `${product1Data.slug}-${uniqueId}`,
				description: product1Data.description,
				sku: `${testPrefix}-sku-${uniqueId}-1`,
				price: product1Data.price,
				categoryId: category1.id,
				status: 'ACTIVE',
			},
		})

		const product2Data = createProductData()
		const product2 = await prisma.product.create({
			data: {
				name: 'Product B1',
				slug: `${product2Data.slug}-${uniqueId}`,
				description: product2Data.description,
				sku: `${testPrefix}-sku-${uniqueId}-2`,
				price: product2Data.price,
				categoryId: category2.id,
				status: 'ACTIVE',
			},
		})

		// Navigate to category1 page
		await page.goto(`/shop/categories/${category1.slug}`)
		await page.waitForURL(`**/categories/${category1.slug}**`)
		
		// Wait for products to load - check for product name in text (more reliable than heading)
		await expect(page.getByText(product1.name)).toBeVisible({ timeout: 10000 })

		// Change filter to category2
		const filterSelect = page.getByLabel(/filter by category/i)
		await filterSelect.selectOption(category2.id)

		// Wait for filter to apply - assert expected product visibility
		await expect(page.getByText(product2.name)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(product1.name)).not.toBeVisible({ timeout: 5000 })
	})
})

