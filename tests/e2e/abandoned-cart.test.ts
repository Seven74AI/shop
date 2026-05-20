import { randomUUID } from 'node:crypto'
import { type TestInfo } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

const ABANDONED_CATEGORY_PREFIX = 'abandoned-e2e-category-'
const ABANDONED_PRODUCT_PREFIX = 'abandoned-e2e-product-'
const ABANDONED_SKU_PREFIX = 'ABANDONED-E2E-'

function getTestPrefix(testInfo: TestInfo) {
	return testInfo.testId.replace(/\W+/g, '-').toLowerCase()
}

async function createTestCategory(testPrefix: string) {
	return prisma.category.create({
		data: {
			name: `Test Category ${testPrefix.slice(-8)}`,
			slug: `${ABANDONED_CATEGORY_PREFIX}${testPrefix}-${randomUUID()}`,
			description: 'Test category for abandoned cart tests',
		},
	})
}

async function createTestProduct(categoryId: string, testPrefix: string) {
	const productData = createProductData()
	const uniqueId = randomUUID()
	return prisma.product.create({
		data: {
			name: productData.name,
			slug: `${ABANDONED_PRODUCT_PREFIX}${testPrefix}-${uniqueId}`,
			description: productData.description,
			sku: `${ABANDONED_SKU_PREFIX}${testPrefix}-${uniqueId}`,
			price: productData.price,
			status: 'ACTIVE',
			categoryId,
		},
	})
}

test.describe('Abandoned Cart Recovery', () => {
	test('recovery route shows error for missing token', async ({ page }) => {
		await page.goto('/recover-cart')
		await page.waitForLoadState('networkidle')

		await expect(
			page.getByText(/missing recovery link/i),
		).toBeVisible({ timeout: 10000 })
		await expect(
			page.getByText(/no recovery token was provided/i),
		).toBeVisible()
	})

	test('recovery route shows error for invalid token', async ({ page }) => {
		await page.goto('/recover-cart?token=invalid-token-value')
		await page.waitForLoadState('networkidle')

		await expect(
			page.getByText(/invalid link/i),
		).toBeVisible({ timeout: 10000 })
		await expect(
			page.getByText(/invalid or has expired/i),
		).toBeVisible()
	})

	test('recovery route shows error for cart not found', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)

		// Create a user
		const user = await prisma.user.create({
			data: {
				email: `abandoned-e2e-${testPrefix.slice(-8)}@example.com`,
				username: `abandonede2e_${testPrefix.slice(-8)}`,
			},
		})

		// Create a recovery token for a non-existent cart
		const { createRecoveryToken } = await import(
			'#app/utils/recovery-token.server.ts'
		)
		const token = createRecoveryToken('non-existent-cart', user.id)

		await page.goto(`/recover-cart?token=${token}`)
		await page.waitForLoadState('networkidle')

		await expect(
			page.getByText(/cart not found/i),
		).toBeVisible({ timeout: 10000 })

		// Cleanup
		await prisma.user.deleteMany({ where: { id: user.id } })
	})

	test('recovery link redirects to cart page for valid token', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)

		// Create test data
		const category = await createTestCategory(testPrefix)
		const product = await createTestProduct(category.id, testPrefix)
		const user = await prisma.user.create({
			data: {
				email: `abandoned-e2e-valid-${testPrefix.slice(-8)}@example.com`,
				username: `abandonede2e_valid_${testPrefix.slice(-8)}`,
			},
		})

		// Create a cart with items for the user
		const cart = await prisma.cart.create({
			data: {
				userId: user.id,
				items: {
					create: {
						productId: product.id,
						quantity: 1,
					},
				},
			},
		})

		// Create a recovery token
		const { createRecoveryToken } = await import(
			'#app/utils/recovery-token.server.ts'
		)
		const token = createRecoveryToken(cart.id, user.id)

		// Navigate to recovery URL — should redirect to /shop/cart
		await page.goto(`/recover-cart?token=${token}`)
		await page.waitForLoadState('networkidle')

		// Should be on the cart page
		await expect(page).toHaveURL(/\/shop\/cart/)

		// Cleanup
		await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
		await prisma.cart.deleteMany({ where: { id: cart.id } })
		await prisma.user.deleteMany({ where: { id: user.id } })
		await prisma.product.deleteMany({ where: { id: product.id } })
		await prisma.category.deleteMany({ where: { id: category.id } })
	})

	test('abandoned cart recovery emails are tracked in database', async ({
		page,
	}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)

		// Skip page interaction - this is a server-side test via DB
		const category = await createTestCategory(testPrefix)
		const product = await createTestProduct(category.id, testPrefix)
		const user = await prisma.user.create({
			data: {
				email: `abandoned-e2e-db-${testPrefix.slice(-8)}@example.com`,
				username: `abandonede2e_db_${testPrefix.slice(-8)}`,
			},
		})

		// Create an abandoned cart (2 hours old)
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
		const cart = await prisma.cart.create({
			data: {
				userId: user.id,
				updatedAt: twoHoursAgo,
				items: {
					create: {
						productId: product.id,
						quantity: 2,
					},
				},
			},
		})

		// Process abandoned carts
		const { processAbandonedCarts } = await import(
			'#app/utils/abandoned-cart.server.ts'
		)
		const result = await processAbandonedCarts(1)

		expect(result.sent).toBeGreaterThanOrEqual(1)

		// Verify the email record was created
		const emailRecord = await prisma.abandonedCartEmail.findFirst({
			where: { cartId: cart.id },
		})
		expect(emailRecord).not.toBeNull()
		expect(emailRecord?.userId).toBe(user.id)
		expect(emailRecord?.email).toBe(user.email)
		expect(emailRecord?.recovered).toBe(false)

		// Cleanup
		await prisma.abandonedCartEmail.deleteMany({ where: { cartId: cart.id } })
		await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
		await prisma.cart.deleteMany({ where: { id: cart.id } })
		await prisma.user.deleteMany({ where: { id: user.id } })
		await prisma.product.deleteMany({ where: { id: product.id } })
		await prisma.category.deleteMany({ where: { id: category.id } })

		// Load any page to satisfy test runner
		await page.goto('/')
	})

	test.afterEach(async ({}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Cleanup any leftover test data
		await prisma.$transaction([
			prisma.abandonedCartEmail.deleteMany({
				where: {
					user: {
						username: {
							startsWith: `abandonede2e_${testPrefix.slice(-8)}`,
						},
					},
				},
			}),
			prisma.cartItem.deleteMany({
				where: {
					product: {
						sku: {
							startsWith: `${ABANDONED_SKU_PREFIX}${testPrefix}-`,
						},
					},
				},
			}),
			prisma.cart.deleteMany({
				where: {
					user: {
						username: {
							startsWith: `abandonede2e_${testPrefix.slice(-8)}`,
						},
					},
				},
			}),
			prisma.user.deleteMany({
				where: {
					username: {
						startsWith: `abandonede2e_${testPrefix.slice(-8)}`,
					},
				},
			}),
			prisma.product.deleteMany({
				where: {
					sku: {
						startsWith: `${ABANDONED_SKU_PREFIX}${testPrefix}-`,
					},
				},
			}),
			prisma.category.deleteMany({
				where: {
					slug: {
						startsWith: `${ABANDONED_CATEGORY_PREFIX}${testPrefix}-`,
					},
				},
			}),
		])
	})
})
