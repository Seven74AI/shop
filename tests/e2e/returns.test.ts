import { randomUUID } from 'node:crypto'
import { type TestInfo } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'

const RETURNS_CATEGORY_PREFIX = 'returns-e2e-category-'
const RETURNS_PRODUCT_PREFIX = 'returns-e2e-product-'
const RETURNS_SKU_PREFIX = 'RETURNS-E2E-'

function getTestPrefix(testInfo: TestInfo) {
	return testInfo.testId.replace(/\W+/g, '-').toLowerCase()
}

async function createTestCategory(testPrefix: string) {
	return prisma.category.create({
		data: {
			name: `Test Category ${testPrefix.slice(-8)}`,
			slug: `${RETURNS_CATEGORY_PREFIX}${testPrefix}-${randomUUID()}`,
			description: 'Test category for returns',
		},
	})
}

async function createTestProduct(categoryId: string, testPrefix: string) {
	const productData = createProductData()
	const uniqueId = randomUUID()
	return prisma.product.create({
		data: {
			name: productData.name,
			slug: `${RETURNS_PRODUCT_PREFIX}${testPrefix}-${uniqueId}`,
			description: productData.description,
			sku: `${RETURNS_SKU_PREFIX}${testPrefix}-${uniqueId}`,
			price: 2999,
			status: 'ACTIVE',
			categoryId,
		},
	})
}

async function createTestOrder(userId: string, orderNumber: string) {
	const order = await prisma.order.create({
		data: {
			orderNumber,
			userId,
			email: 'test@example.com',
			subtotal: 2999,
			total: 2999,
			shippingName: 'Test User',
			shippingStreet: '123 Test St',
			shippingCity: 'Testville',
			shippingPostal: '12345',
			shippingCountry: 'US',
			status: 'CONFIRMED',
			stripeCheckoutSessionId: `cs_test_${randomUUID()}`,
		},
	})
	return order
}

test.describe('Customer Returns', () => {

	test('should show Returns in account sidebar', async ({ page, login }) => {
		await login()
		await page.goto('/account')

		// Returns link should be visible in sidebar
		await expect(page.getByRole('link', { name: /returns/i })).toBeVisible()
	})

	test('should show empty state on returns page when no returns exist', async ({ page, login }) => {
		const user = await login()
		// Verify no returns exist for this user
		const returns = await prisma.returnRequest.findMany({
			where: { order: { userId: user.id } },
			select: { id: true },
		})
		expect(returns).toHaveLength(0)

		await page.goto('/account/returns')

		await expect(page.getByRole('heading', { name: /returns/i })).toBeVisible()
		await expect(page.getByText(/no return requests/i)).toBeVisible()
	})

	test('should show Request Return button on order detail page', async ({ page, login }, _testInfo) => {
		const user = await login()

		const orderNumber = await generateOrderNumber()
		await createTestOrder(user.id, orderNumber)

		await page.goto(`/account/orders/${orderNumber}`)

		// Request Return button should be visible
		await expect(page.getByRole('link', { name: /request return/i })).toBeVisible()
	})

	test('should show new return form with items from order', async ({ page, login }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		const category = await createTestCategory(testPrefix)
		const product = await createTestProduct(category.id, testPrefix)
		const user = await login()

		const orderNumber = await generateOrderNumber()
		const order = await createTestOrder(user.id, orderNumber)

		// Add an item to the order
		await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: product.id,
				quantity: 2,
				price: 2999,
			},
		})

		await page.goto(`/account/returns/new?orderId=${order.id}`)

		// Should show the product name
		await expect(page.getByText(product.name)).toBeVisible()

		// Should show reason field
		await expect(page.getByRole('textbox', { name: /reason/i })).toBeVisible()

		// Should show submit button
		await expect(page.getByRole('button', { name: /submit return request/i })).toBeVisible()
	})

	test('should list return requests after creation', async ({ page, login }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		const category = await createTestCategory(testPrefix)
		const product = await createTestProduct(category.id, testPrefix)
		const user = await login()

		const orderNumber = await generateOrderNumber()
		const order = await createTestOrder(user.id, orderNumber)

		// Add an item to the order
		const orderItem = await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: product.id,
				quantity: 2,
				price: 2999,
			},
		})

		// Create a return request directly via DB
		const _returnRequest = await prisma.returnRequest.create({
			data: {
				orderId: order.id,
				reason: 'Item arrived damaged',
				status: 'REQUESTED',
				items: {
					create: {
						orderItemId: orderItem.id,
						quantity: 1,
						reasonItem: 'Box was crushed',
					},
				},
			},
		})

		await page.goto('/account/returns')

		// Should show the return in the list
		await expect(page.getByText(`Return for Order ${orderNumber}`)).toBeVisible()
		await expect(page.getByText('Requested')).toBeVisible()
	})

	test('should show return detail page', async ({ page, login }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		const category = await createTestCategory(testPrefix)
		const product = await createTestProduct(category.id, testPrefix)
		const user = await login()

		const orderNumber = await generateOrderNumber()
		const order = await createTestOrder(user.id, orderNumber)

		const orderItem = await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: product.id,
				quantity: 2,
				price: 2999,
			},
		})

		const returnRequest = await prisma.returnRequest.create({
			data: {
				orderId: order.id,
				reason: 'Changed my mind',
				customerNotes: 'The color was different than expected',
				status: 'REQUESTED',
				items: {
					create: {
						orderItemId: orderItem.id,
						quantity: 1,
					},
				},
			},
		})

		await page.goto(`/account/returns/${returnRequest.id}`)

		// Should show return details
		await expect(page.getByRole('heading', { name: /return request/i })).toBeVisible()
		await expect(page.getByText('Changed my mind')).toBeVisible()
		await expect(page.getByText('The color was different than expected')).toBeVisible()
		await expect(page.getByText('Requested')).toBeVisible()
	})

	test('should enforce authorization - cannot view another user\'s return', async ({ page, login }) => {
		const user1 = await login()

		// Create a return for user1
		const orderNumber = await generateOrderNumber()
		const order = await createTestOrder(user1.id, orderNumber)
		const orderItem = await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: (await createTestProduct((await createTestCategory('auth-test-1')).id, 'auth-test')).id,
				quantity: 1,
				price: 1999,
			},
		})
		const returnRequest = await prisma.returnRequest.create({
			data: {
				orderId: order.id,
				reason: 'Test return',
				status: 'REQUESTED',
				items: {
					create: {
						orderItemId: orderItem.id,
						quantity: 1,
					},
				},
			},
		})

		// Log out and log in as a different user
		await page.goto('/logout')
		const _user2 = await login()

		// Try to access user1's return - should get 403
		const _response = await page.goto(`/account/returns/${returnRequest.id}`)
		// React Router error boundaries may return 200 with an error message
		await expect(page.getByText(/unauthorized|forbidden|not found/i)).toBeVisible()
	})
})
