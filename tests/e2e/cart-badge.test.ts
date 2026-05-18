import { randomUUID } from 'node:crypto'
import { type Page, type TestInfo } from '@playwright/test'
import { getPasswordHash } from '#app/utils/auth.server.ts'
import { mergeCartOnUserLogin } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

/**
 * Helper to manually trigger cart merge in tests.
 * Since the login fixture bypasses handleNewSession, we need to manually merge carts.
 * @param page - The Playwright page object
 * @param userId - The user ID to merge the cart for
 */
async function mergeCartInTest(page: Page, userId: string) {
	const cookies = await page.context().cookies()
	const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
	const mockRequest = new Request('http://localhost:3000/', {
		headers: { cookie: cookieHeader },
	})
	await mergeCartOnUserLogin(mockRequest, userId)
}

const TEST_SKU_PREFIX = 'CB-E2E-'
const TEST_CATEGORY_PREFIX = 'cb-e2e-category-'

function getTestPrefix(testInfo: TestInfo) {
	return testInfo.testId.replace(/\W+/g, '-').toLowerCase()
}

function createTestCategory(testPrefix: string) {
	return prisma.category.create({
		data: {
			name: `Test Category ${testPrefix.slice(-8)}`,
			slug: `${TEST_CATEGORY_PREFIX}${testPrefix}-${randomUUID()}`,
		},
	})
}

async function createTestProduct(categoryId: string, testPrefix: string) {
	const productData = createProductData()
	const uniqueId = randomUUID()
	return prisma.product.create({
		data: {
			name: productData.name,
			slug: `cb-e2e-product-${testPrefix}-${uniqueId}`,
			description: productData.description,
			sku: `${TEST_SKU_PREFIX}${testPrefix}-${uniqueId}`,
			price: productData.price,
			categoryId,
			status: 'ACTIVE',
		},
	})
}

test.describe('Cart Badge', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 })
	test.afterEach(async ({}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Individual cleanup — avoids SQLITE_BUSY from transaction locks during parallel runs
		try {
			await prisma.orderItem.deleteMany({
				where: { product: { sku: { startsWith: `${TEST_SKU_PREFIX}${testPrefix}-` } } },
			})
		} catch (_) { /* ok */ }
		try {
			await prisma.cartItem.deleteMany({
				where: { product: { sku: { startsWith: `${TEST_SKU_PREFIX}${testPrefix}-` } } },
			})
		} catch (_) { /* ok */ }
		try {
			await prisma.product.deleteMany({
				where: { sku: { startsWith: `${TEST_SKU_PREFIX}${testPrefix}-` } },
			})
		} catch (_) { /* ok */ }
		try {
			await prisma.category.deleteMany({
				where: { slug: { startsWith: `${TEST_CATEGORY_PREFIX}${testPrefix}-` } },
			})
		} catch (_) { /* ok */ }
	})

	test('cart badge should display item count', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)

		// Create test product and category
		const category = await createTestCategory(testPrefix)

		const product = await createTestProduct(category.id, testPrefix)

		// Brief wait to let SQLite locks from Prisma operations clear
		await page.waitForTimeout(500)

		// Ensure server is responsive before navigating
		await page.goto('/')

		// Navigate to product detail page
		await page.goto(`/shop/products/${product.slug}`)

		// Cart badge should be visible (no count shown when cart is empty)
		const cartBadgeLink = page.getByRole('link', { name: /shopping cart with 0 items/i })
		await expect(cartBadgeLink).toBeVisible({ timeout: 10000 })

		// Add product to cart
		await page.getByRole('button', { name: /add to cart/i }).click()

		// Wait for redirect to cart page
		await page.waitForURL('**/shop/cart', { timeout: 15000 })
		
		// Cart badge should now show 1 item on the cart page
		const cartPageBadge = page.getByRole('link', { name: /shopping cart with 1 item/i })
		await expect(cartPageBadge).toBeVisible({ timeout: 10000 })
		await expect(cartPageBadge.getByText('1')).toBeVisible({ timeout: 5000 })
	})

	test('cart badge should display correct count for multiple items', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)

		// Create test product and category
		const category = await createTestCategory(testPrefix)

		const product = await createTestProduct(category.id, testPrefix)

		// Brief wait to let SQLite locks from Prisma operations clear
		await page.waitForTimeout(500)

		// Ensure server is responsive before navigating
		await page.goto('/')

		// Navigate to product detail page and add to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()
		await page.waitForURL('**/shop/cart', { timeout: 15000 })

		// Update quantity to 3
		const quantityInput = page.getByLabel(/quantity/i)
		await quantityInput.fill('3')
		await page.getByRole('button', { name: /update/i }).click()

		// Wait for cart to reflect update (state-based)
		await expect(quantityInput).toHaveValue('3', { timeout: 5000 })
		// Navigate to shop to trigger root loader revalidation for badge
		await page.goto('/shop')
		const cartBadge = page.getByRole('link', { name: /shopping cart with 3 items/i })
		await expect(cartBadge).toBeVisible({ timeout: 15000 })
		await expect(cartBadge.getByText('3')).toBeVisible({ timeout: 5000 })
	})

	test('cart should merge guest cart with user cart on login', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Create test category
		const category = await createTestCategory(testPrefix)

		// Create test product
		const product = await createTestProduct(category.id, testPrefix)

		// Brief wait to let SQLite locks from Prisma operations clear
		await page.waitForTimeout(500)

		// Ensure server is responsive before navigating
		await page.goto('/')

		// As a guest, add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()
		await page.waitForURL('**/shop/cart', { timeout: 15000 })
		
		// Verify guest cart has 1 item
		const guestCartBadge = page.getByRole('link', { name: /shopping cart with 1 item/i })
		await expect(guestCartBadge).toBeVisible({ timeout: 10000 })

		// Ensure user role exists (may be missing in test DB)
		await prisma.role.upsert({
			where: { name: 'user' },
			update: {},
			create: { name: 'user', description: 'User' },
		})

		const username = `test${Date.now()}`
		const password = username
		const hashedPassword = await getPasswordHash(password)

		await prisma.user.create({
			data: {
				username,
				name: 'Test User',
				email: `test${Date.now()}@example.com`,
				roles: { connect: { name: 'user' } },
				password: { create: { hash: hashedPassword } },
			},
		})

		await page.goto('/login')
		await page.getByRole('textbox', { name: /username/i }).fill(username)
		await page.getByLabel(/^password$/i).fill(password)
		await page.getByRole('button', { name: /log in/i }).click()

		// After login, wait for redirect
		await page.waitForURL(/\/(?:|\?redirectTo=)|\/settings\/profile/)
		
		// Check if cart badge is visible (should have 1 item from guest cart)
		const userCartBadge = page.getByRole('link', { name: /shopping cart with 1 item/i })
		await expect(userCartBadge).toBeVisible({ timeout: 10000 })
	})

	test('guest cart should not contain user cart items after logout', async ({ page, login, logout }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		await login()

		// Create test category and product
		const category = await createTestCategory(testPrefix)

		const product = await createTestProduct(category.id, testPrefix)

		// Brief wait to let SQLite locks from Prisma operations clear
		await page.waitForTimeout(500)

		// Ensure server is responsive
		await page.goto('/')

		// As logged-in user, add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()
		await page.waitForURL('**/shop/cart', { timeout: 15000 })
		
		// Verify user cart has 1 item
		const userCartBadge = page.getByRole('link', { name: /shopping cart/i })
		await expect(userCartBadge).toBeVisible({ timeout: 10000 })

		await logout()

		// As guest, add product to cart again
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()
		await page.waitForURL('**/shop/cart', { timeout: 15000 })
		
		// Verify guest cart has ONLY 1 item (not the item from when logged in)
		const guestCartBadge = page.getByRole('link', { name: /shopping cart with 1 item/i })
		await expect(guestCartBadge).toBeVisible({ timeout: 10000 })
		await expect(guestCartBadge.getByText('1')).toBeVisible({ timeout: 5000 })

		// Verify cart page shows only 1 item (not 2 from user cart + guest cart)
		await expect(page.getByRole('heading', { name: product.name })).toHaveCount(1)
	})

	test('cart should persist correctly through multiple login/logout cycles', async ({ page, login, logout }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Create test products
		const category = await createTestCategory(testPrefix)

		const product1 = await createTestProduct(category.id, testPrefix)

		const product2 = await createTestProduct(category.id, testPrefix)

		// Brief wait to let SQLite locks from Prisma operations clear
		await page.waitForTimeout(500)

		// Ensure server is responsive before navigating
		await page.goto('/')

		// 1. As guest, add product1 to cart
		await page.goto(`/shop/products/${product1.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()
		await page.waitForURL('**/shop/cart', { timeout: 15000 })
		const guestCartBadge1 = page.getByRole('link', { name: /shopping cart with 1 item/i })
		await expect(guestCartBadge1).toBeVisible({ timeout: 10000 })

		// 2. Login - product1 should merge into user cart
		// Note: The login fixture bypasses handleNewSession, so we need to manually merge
		const user = await login()
		
		// Navigate to establish session before merge
		await page.goto('/')
		
		// Manually trigger cart merge since login fixture bypasses handleNewSession
		await mergeCartInTest(page, user.id)
		
		// Verify the cart has 1 item by checking the cart page
		await page.goto('/shop/cart')
		await expect(page.getByRole('heading', { name: product1.name })).toBeVisible({ timeout: 10000 })
		
		// Go back to shop and verify badge shows 1 item
		await page.goto('/shop')
		const userCartBadge1 = page.getByRole('link', { name: /shopping cart with 1 item/i })
		await expect(userCartBadge1).toBeVisible({ timeout: 10000 })

		// 3. As logged-in user, add product2 to cart
		await page.goto(`/shop/products/${product2.slug}`)
		const addProduct2Btn = page.getByRole('button', { name: /add to cart/i })
		await expect(addProduct2Btn).toBeVisible({ timeout: 10000 })
		await addProduct2Btn.click()
		await page.waitForURL('**/shop/cart', { timeout: 15000 })
		
		// Verify cart has 2 products (product1 and product2)
		// Use getByText instead of heading for more reliable matching
		await expect(page.getByText(product1.name)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(product2.name)).toBeVisible({ timeout: 10000 })

		// 4. Update product1 quantity to 2 in user cart
		const quantityInput = page.getByLabel(/quantity/i).first()
		await quantityInput.fill('2')
		await page.getByRole('button', { name: /update/i }).first().click()
		// Wait for cart to reflect update (state-based, not time-based)
		await expect(quantityInput).toHaveValue('2', { timeout: 5000 })
		await page.goto('/') // Navigate away and back to trigger badge update
		const userCartBadge2 = page.getByRole('link', { name: /shopping cart with 3 items/i })
		await expect(userCartBadge2).toBeVisible({ timeout: 10000 })

		// 5. Logout - cart should be cleared
		await logout()
		// Wait for logout to complete and page to update
		// Navigate to trigger badge update
		await page.goto('/shop')
		const guestCartBadge2 = page.getByRole('link', { name: /shopping cart with 0 items/i })
		await expect(guestCartBadge2).toBeVisible({ timeout: 10000 })

		// 6. As guest, add product1 to cart (which is already in user cart with qty 2)
		await page.goto(`/shop/products/${product1.slug}`)
		// Wait for product page to load (avoids 404 from parallel test cleanup)
		await expect(page.getByRole('heading', { name: product1.name })).toBeVisible({ timeout: 10000 })
		const guestAddBtn = page.getByRole('button', { name: /add to cart/i })
		await expect(guestAddBtn).toBeVisible({ timeout: 10000 })
		await guestAddBtn.click()
		await page.waitForURL('**/shop/cart', { timeout: 15000 })
		const guestCartBadge3 = page.getByRole('link', { name: /shopping cart with 1 item/i })
		await expect(guestCartBadge3).toBeVisible({ timeout: 10000 })

		// 7. Login again - product1 should merge into user cart
		const user2 = await login()
		
		// Navigate to establish session before merge (login fixture sets cookie but app needs a request)
		await page.goto('/')
		
		// Manually trigger cart merge since login fixture bypasses handleNewSession
		await mergeCartInTest(page, user2.id)
		
		// 8. Verify cart has the merged product from guest cart
		// Note: After logout, the user's cart was cleared, so only the guest cart (product1 qty 1) should be present
		await page.goto('/shop/cart')
		await expect(page.getByRole('heading', { name: product1.name })).toBeVisible({ timeout: 10000 })
		
		// Verify product1 quantity is 1 (the guest cart item was merged into empty user cart)
		const product1Quantity = page.getByRole('spinbutton', { name: /quantity/i }).first()
		await expect(product1Quantity).toHaveValue('1')
		
		// Go back to shop and verify badge shows 1 item - wait for root loader to fetch cart count
		await page.goto('/shop')
		const userCartBadge3 = page.getByRole('link', { name: /shopping cart with 1 item/i })
		await expect(userCartBadge3).toBeVisible({ timeout: 15000 })
	})
})

