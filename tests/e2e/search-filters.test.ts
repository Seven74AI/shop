import { randomUUID } from 'node:crypto'
import { type TestInfo } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { ensureFts5Migration } from '#tests/fts5-utils.ts'
import { test, expect } from '../playwright-utils.ts'

const SEARCH_PRODUCT_SLUG_PREFIX = 'search-e2e-product-'
const SEARCH_CATEGORY_SLUG_PREFIX = 'search-e2e-category-'
const SEARCH_SKU_PREFIX = 'SEARCH-E2E-'

function getTestPrefix(testInfo: TestInfo) {
	return testInfo.testId.replace(/\W+/g, '-').toLowerCase()
}

async function createSearchCategory(name: string, testPrefix: string) {
	const uniqueId = randomUUID()
	return prisma.category.create({
		data: {
			name,
			slug: `${SEARCH_CATEGORY_SLUG_PREFIX}${testPrefix}-${uniqueId}`,
			description: `Test category for search filters: ${name}`,
		},
	})
}

async function createSearchProduct(
	name: string,
	categoryId: string,
	price: number,
	testPrefix: string,
) {
	const uniqueId = randomUUID()
	return prisma.product.create({
		data: {
			name,
			slug: `${SEARCH_PRODUCT_SLUG_PREFIX}${testPrefix}-${uniqueId}`,
			description: `E2E test product: ${name}`,
			sku: `${SEARCH_SKU_PREFIX}${testPrefix}-${uniqueId}`,
			price,
			status: 'ACTIVE',
			categoryId,
		},
	})
}

test.describe('Search Filters (faceted)', () => {
	test.describe.configure({ mode: 'serial', timeout: 60000 })

	test.beforeAll(async ({ browser }) => {
		await ensureFts5Migration()
		// Warm up the server — first SSR render can be slow
		const page = await browser.newPage()
		await page.goto('/shop/products', { timeout: 30000 })
		await page.close()
	})

	// ─── Sidebar visibility ──────────────────────────────────────────────

	test('products page shows search filters sidebar', async ({ page }) => {
		await page.goto('/shop/products')
		await expect(page.getByTestId('search-filters')).toBeVisible()
	})

	test('category filter section is visible when categories exist', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('TestCat', prefix)
		await createSearchProduct('TestProduct', cat.id, 999, prefix)
		await ensureFts5Migration()

		await page.goto('/shop/products')
		await expect(page.getByText('Categories', { exact: true })).toBeVisible({ timeout: 10000 })
	})

	test('price range filter section is visible', async ({ page }) => {
		await page.goto('/shop/products')
		await expect(page.getByText('Price Range')).toBeVisible()
	})

	test('sort select is visible on products page', async ({ page }) => {
		await page.goto('/shop/products')
		await expect(page.getByTestId('sort-form')).toBeVisible()
	})

	// ─── Category filter (via URL navigation) ────────────────────────────

	test('category filter in URL filters products by that category', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Gadgets', prefix)
		await createSearchProduct('Wireless Mouse', cat.id, 2999, prefix)
		await createSearchProduct('Mechanical Keyboard', cat.id, 8999, prefix)
		await ensureFts5Migration()

		// Navigate with category filter in URL
		await page.goto(`/shop/products?category=${cat.id}`)

		// Verify the filter sidebar shows the category as checked
		await expect(page.getByLabel(/Gadgets/i, { exact: false })).toBeChecked({ timeout: 10000 })

		// "All Categories" should NOT be checked
		await expect(page.getByLabel('All Categories', { exact: true })).not.toBeChecked()
	})

	test('"All Categories" checkbox is checked when no category filter', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Electronics', prefix)
		await createSearchProduct('USB Hub', cat.id, 1999, prefix)
		await ensureFts5Migration()

		// No category filter → "All Categories" should be checked
		await page.goto('/shop/products')
		await expect(page.getByLabel('All Categories', { exact: true })).toBeChecked({ timeout: 10000 })
	})

	// ─── Price range filter (via URL navigation) ─────────────────────────

	test('price range filter in URL activates the correct checkbox', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Watches', prefix)
		await createSearchProduct('Budget Watch', cat.id, 1999, prefix)
		await createSearchProduct('Mid-range Watch', cat.id, 3500, prefix)
		await createSearchProduct('Luxury Watch', cat.id, 15000, prefix)
		await ensureFts5Migration()

		// Navigate with $25-$50 price range (2500-4999 cents)
		await page.goto('/shop/products?minPrice=2500&maxPrice=4999')

		// The "$25 - $50" checkbox should be checked
		await expect(page.getByLabel(/\$25 - \$50/i, { exact: false })).toBeChecked({ timeout: 10000 })
	})

	test('"All Prices" checkbox is checked when no price filter', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Gadgets', prefix)
		await createSearchProduct('Cheap Gadget', cat.id, 1999, prefix)
		await ensureFts5Migration()

		await page.goto('/shop/products')
		await expect(page.getByLabel('All Prices', { exact: true })).toBeChecked({ timeout: 10000 })
	})

	// ─── Search + filter combination ─────────────────────────────────────

	test('search query is preserved in URL when category filter is active', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Audio', prefix)
		await createSearchProduct('Wireless Earbuds Pro', cat.id, 7999, prefix)
		await createSearchProduct('Wireless Speaker', cat.id, 4999, prefix)
		await ensureFts5Migration()

		// Search for "Wireless" with category filter
		await page.goto(`/shop/products?q=Wireless&category=${cat.id}`)

		// Search input should have the query
		await expect(page.getByTestId('product-search-input')).toHaveValue('Wireless')

		// Category should be checked
		await expect(page.getByLabel(/Audio/i, { exact: false })).toBeChecked({ timeout: 10000 })
	})

	test('category filter is preserved when performing a new search', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Books', prefix)
		await createSearchProduct('TypeScript Handbook', cat.id, 3999, prefix)
		await createSearchProduct('JavaScript Guide', cat.id, 2999, prefix)
		await ensureFts5Migration()

		// Start with category filter applied
		await page.goto(`/shop/products?category=${cat.id}`)

		// Type a search query and submit
		await page.getByTestId('product-search-input').fill('TypeScript')
		await page.getByTestId('product-search-submit').click()

		// URL should have both q and category (order may vary)
		await page.waitForURL(/q=TypeScript/, { timeout: 10000 })
		expect(page.url()).toContain('category=')
	})

	// ─── Sort + filter interaction ───────────────────────────────────────

	test('sort order is shown in URL alongside filters', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Tools', prefix)
		await createSearchProduct('Cheap Hammer', cat.id, 999, prefix)
		await createSearchProduct('Expensive Drill', cat.id, 19999, prefix)
		await ensureFts5Migration()

		// Navigate with sort and category
		await page.goto(`/shop/products?sort=price_asc&category=${cat.id}`)

		// Both sort and category should be reflected in the page
		await expect(page.getByTestId('sort-form')).toBeVisible()
		await expect(page.getByLabel(/Tools/i, { exact: false })).toBeChecked({ timeout: 10000 })
		expect(page.url()).toContain('sort=price_asc')
		expect(page.url()).toContain('category=')
	})

	// ─── Empty state ─────────────────────────────────────────────────────

	test('shows empty results message when no products match filters', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Sports', prefix)
		await createSearchProduct('Running Shoes', cat.id, 8999, prefix)
		await ensureFts5Migration()

		await page.goto('/shop/products?q=xyznonexistent123456')
		await expect(page.getByTestId('empty-results')).toBeVisible()
		await expect(page.getByText(/no products found/i)).toBeVisible()
	})

	// ─── Multiple filters ────────────────────────────────────────────────

	test('applying category + price range shows both filters active', async ({
		page,
	}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		const cat = await createSearchCategory('Home', prefix)
		await createSearchProduct('Budget Lamp', cat.id, 3500, prefix)
		await createSearchProduct('Premium Chandelier', cat.id, 25000, prefix)
		await ensureFts5Migration()

		// Navigate with both filters: category + "$25 - $50" range (min=2500, max=4999)
		await page.goto(`/shop/products?category=${cat.id}&minPrice=2500&maxPrice=4999`)

		// Both filters should be active
		await expect(page.getByLabel(/Home/i, { exact: false })).toBeChecked({ timeout: 10000 })
		await expect(page.getByLabel(/\$25 - \$50/i, { exact: false })).toBeChecked({ timeout: 10000 })
	})

	// ─── Results count ───────────────────────────────────────────────────

	test('products page shows total result count', async ({ page }) => {
		await page.goto('/shop/products')
		// The page shows "N products" text
		await expect(page.getByText(/\d+ product/)).toBeVisible()
	})

	// ─── Cleanup ─────────────────────────────────────────────────────────

	test.afterEach(async ({}, testInfo) => {
		const prefix = getTestPrefix(testInfo)
		try {
			await prisma.orderItem.deleteMany({
				where: { product: { sku: { startsWith: `${SEARCH_SKU_PREFIX}${prefix}-` } } },
			})
		} catch {}
		try {
			await prisma.cartItem.deleteMany({
				where: { product: { sku: { startsWith: `${SEARCH_SKU_PREFIX}${prefix}-` } } },
			})
		} catch {}
		try {
			await prisma.product.deleteMany({
				where: { slug: { startsWith: SEARCH_PRODUCT_SLUG_PREFIX } },
			})
		} catch {}
		try {
			await prisma.category.deleteMany({
				where: { slug: { startsWith: SEARCH_CATEGORY_SLUG_PREFIX } },
			})
		} catch {}
	})
})
