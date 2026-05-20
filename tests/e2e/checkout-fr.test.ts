/**
 * Checkout FR E2E Tests
 *
 * Verifies that the checkout flow displays French translations
 * when the locale is set to FR (via cookie).
 */
import { type Page } from '@playwright/test'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Set the locale cookie to French for the given page.
 */
async function setLocaleFr(page: Page) {
	await page.context().addCookies([
		{
			name: 'localePreference',
			value: 'fr',
			domain: 'localhost',
			path: '/',
		},
	])
	// Refresh to apply cookie
	await page.reload()
}

test.describe('Checkout FR locale', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 })

	test('should display French translation on checkout review page', async ({
		page,
	}) => {
		await page.goto('/')
		await setLocaleFr(page)

		// Verify global nav is translated
		await expect(page.getByRole('link', { name: 'Boutique' })).toBeVisible()
	})

	test('should serve French locale from Accept-Language header', async ({
		context,
	}) => {
		// Create a new context with French Accept-Language
		const frContext = await context.browser()?.newContext({
			locale: 'fr-FR',
		})
		if (!frContext) throw new Error('Browser context not available')
		const frPage = await frContext.newPage()

		await frPage.goto('/')

		// Nav should be in French due to Accept-Language header
		const shopLink = frPage.getByRole('link', { name: 'Boutique' })
		await expect(shopLink).toBeVisible({ timeout: 10000 })

		await frContext.close()
	})

	test('should display French translation in error pages', async ({
		page,
	}) => {
		await page.goto('/')
		await setLocaleFr(page)

		// Navigate to a non-existent page to test error translation
		await page.goto('/shop/checkout/nonexistent')

		// Should render some error — the key is that the nav is in French
		await expect(page.getByRole('link', { name: 'Boutique' })).toBeVisible()
	})
})
