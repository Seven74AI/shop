import { randomUUID } from 'node:crypto'
import { type TestInfo } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'

const PROMO_CATEGORY_PREFIX = 'promo-e2e-category-'
const PROMO_PRODUCT_PREFIX = 'promo-e2e-product-'
const PROMO_SKU_PREFIX = 'PROMO-E2E-'

function getTestPrefix(testInfo: TestInfo) {
	return testInfo.testId.replace(/\W+/g, '-').toLowerCase()
}

async function createTestCategory(testPrefix: string) {
	return prisma.category.create({
		data: {
			name: `Test Category ${testPrefix.slice(-8)}`,
			slug: `${PROMO_CATEGORY_PREFIX}${testPrefix}-${randomUUID()}`,
			description: 'Test category for promo tests',
		},
	})
}

async function createTestProduct(
	categoryId: string,
	testPrefix: string,
	options?: { price?: number; stockQuantity?: number },
) {
	const productData = createProductData()
	const uniqueId = randomUUID()
	return prisma.product.create({
		data: {
			name: productData.name,
			slug: `${PROMO_PRODUCT_PREFIX}${testPrefix}-${uniqueId}`,
			description: productData.description,
			sku: `${PROMO_SKU_PREFIX}${testPrefix}-${uniqueId}`,
			price: options?.price ?? productData.price,
			status: 'ACTIVE',
			categoryId,
			stockQuantity: options?.stockQuantity,
		},
	})
}

test.describe('Promo code on checkout review', () => {
	test.describe.configure({ mode: 'serial', timeout: 120_000 })

	test('should show discount when valid promo code is applied', async ({
		page,
	}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)

		// Create a promotion
		const promoCode = `PROMO${testPrefix.slice(0, 8).toUpperCase()}`
		await prisma.promotion.create({
			data: {
				code: promoCode,
				description: 'E2E test 10% off',
				type: 'PERCENTAGE',
				value: 1000, // 10%
				isActive: true,
			},
		})

		// Create test data
		const category = await createTestCategory(testPrefix)
		const product = await createTestProduct(category.id, testPrefix, {
			price: 5000, // $50.00
			stockQuantity: 10,
		})

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		const addButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addButton).toBeVisible({ timeout: 10000 })
		await addButton.click()
		await expect(page).toHaveURL(/\/shop\/cart/, { timeout: 5000 })

		// Navigate to checkout review
		await page.goto('/shop/checkout')
		await page.waitForURL(/\/shop\/checkout\/review/, { timeout: 15000 })

		// Wait for the review page to load
		await expect(page.getByText('Order Summary')).toBeVisible({ timeout: 10000 })

		// Enter coupon code
		const couponInput = page.getByPlaceholder('Coupon code')
		await expect(couponInput).toBeVisible({ timeout: 5000 })
		await couponInput.fill(promoCode)

		// Apply coupon
		await page.getByRole('button', { name: /apply/i }).click()

		// Wait for the page to reload with coupon applied
		await page.waitForURL(new RegExp(`coupon=${promoCode}`), { timeout: 10000 })

		// Verify discount is shown
		await expect(page.getByText(/applied:/i)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(/Discount/i)).toBeVisible({ timeout: 5000 })

		// Clean up
		await prisma.promotion.deleteMany({ where: { code: promoCode } })
	})

	test('should show error for invalid promo code', async ({
		page,
	}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)

		const category = await createTestCategory(testPrefix)
		const product = await createTestProduct(category.id, testPrefix, {
			price: 3000,
			stockQuantity: 5,
		})

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		const addButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addButton).toBeVisible({ timeout: 10000 })
		await addButton.click()
		await expect(page).toHaveURL(/\/shop\/cart/, { timeout: 5000 })

		// Navigate to checkout review
		await page.goto('/shop/checkout')
		await page.waitForURL(/\/shop\/checkout\/review/, { timeout: 15000 })

		// Wait for the review page to load
		await expect(page.getByText('Order Summary')).toBeVisible({ timeout: 10000 })

		// Enter invalid coupon code
		const couponInput = page.getByPlaceholder('Coupon code')
		await expect(couponInput).toBeVisible({ timeout: 5000 })
		await couponInput.fill('INVALIDCODE123')

		// Apply coupon
		await page.getByRole('button', { name: /apply/i }).click()

		// Wait for page reload with the invalid code
		await page.waitForURL(/coupon=INVALIDCODE123/, { timeout: 10000 })

		// Verify error is shown
		await expect(page.getByText(/invalid coupon code/i)).toBeVisible({ timeout: 10000 })
	})

	test('should clear coupon and remove discount', async ({
		page,
	}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)

		const promoCode = `CLR${testPrefix.slice(0, 7).toUpperCase()}`
		await prisma.promotion.create({
			data: {
				code: promoCode,
				description: 'E2E test $5 off',
				type: 'FIXED_AMOUNT',
				value: 500, // $5.00
				isActive: true,
			},
		})

		const category = await createTestCategory(testPrefix)
		const product = await createTestProduct(category.id, testPrefix, {
			price: 3000,
			stockQuantity: 5,
		})

		// Add to cart
		await page.goto(`/shop/products/${product.slug}`)
		const addButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addButton).toBeVisible({ timeout: 10000 })
		await addButton.click()
		await expect(page).toHaveURL(/\/shop\/cart/, { timeout: 5000 })

		// Apply coupon
		await page.goto(`/shop/checkout?coupon=${promoCode}`)
		await page.waitForURL(new RegExp(`coupon=${promoCode}`), { timeout: 15000 })
		await expect(page.getByText(/applied:/i)).toBeVisible({ timeout: 10000 })

		// Clear coupon
		await page.getByRole('button', { name: /clear/i }).click()
		await page.waitForURL(/\/shop\/checkout\/review$/, { timeout: 10000 })

		// Verify discount is gone
		await expect(page.getByText(/Discount/i)).not.toBeVisible({ timeout: 5000 })

		// Clean up
		await prisma.promotion.deleteMany({ where: { code: promoCode } })
	})

	test.afterEach(async ({}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Cleanup sequentially
		const cleanupOps = [
			async () => {
				try {
					await prisma.orderItem.deleteMany({
						where: { product: { sku: { startsWith: `${PROMO_SKU_PREFIX}${testPrefix}-` } } },
					})
				} catch { /* ignore */ }
			},
			async () => {
				try {
					await prisma.cartItem.deleteMany({
						where: { product: { sku: { startsWith: `${PROMO_SKU_PREFIX}${testPrefix}-` } } },
					})
				} catch { /* ignore */ }
			},
			async () => {
				try {
					await prisma.product.deleteMany({
						where: { sku: { startsWith: `${PROMO_SKU_PREFIX}${testPrefix}-` } } },
					)
				} catch { /* ignore */ }
			},
			async () => {
				try {
					await prisma.category.deleteMany({
						where: { slug: { startsWith: `${PROMO_CATEGORY_PREFIX}${testPrefix}-` } },
					})
				} catch { /* ignore */ }
			},
		]
		for (const op of cleanupOps) {
			await op()
		}
	})
})
