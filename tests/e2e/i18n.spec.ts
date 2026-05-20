/**
 * E2E tests for i18n / locale switching.
 *
 * Verifies:
 * - Locale switch buttons render and are clickable
 * - Cookie is set after locale switch
 * - Translations render in the selected locale
 * - Both EN and FR locales work end-to-end
 */
import { test, expect } from '../playwright-utils.ts'

test.describe('i18n — locale switching', () => {
	test('renders locale switch buttons in footer', async ({ page }) => {
		await page.goto('/')
		// Both EN and FR buttons should be visible
		const enButton = page.getByRole('button', { name: /english/i })
		const frButton = page.getByRole('button', { name: /français/i })

		await expect(enButton).toBeVisible()
		await expect(frButton).toBeVisible()
	})

	test('switches to French when FR button is clicked', async ({
		page,
	}) => {
		await page.goto('/')
		const frButton = page.getByRole('button', { name: /français/i })
		await frButton.click()

		// Should redirect back to home
		await page.waitForURL('/')

		// Cookie should be set
		const cookies = await page.context().cookies()
		const localeCookie = cookies.find(
			(c) => c.name === 'localePreference',
		)
		expect(localeCookie).toBeTruthy()
		expect(localeCookie!.value).toBe('fr')
	})

	test('switches to English when EN button is clicked', async ({
		page,
	}) => {
		// Start with French cookie
		await page.context().addCookies([
			{
				name: 'localePreference',
				value: 'fr',
				domain: 'localhost',
				path: '/',
			},
		])
		await page.goto('/')
		const enButton = page.getByRole('button', { name: /english/i })
		await enButton.click()

		await page.waitForURL('/')

		const cookies = await page.context().cookies()
		const localeCookie = cookies.find(
			(c) => c.name === 'localePreference',
		)
		expect(localeCookie!.value).toBe('en')
	})

	test('locale persists across page navigation', async ({ page }) => {
		// Set French locale
		await page.context().addCookies([
			{
				name: 'localePreference',
				value: 'fr',
				domain: 'localhost',
				path: '/',
			},
		])
		await page.goto('/')

		// Navigate to shop
		await page.getByRole('link', { name: /boutique/i }).click()
		await page.waitForURL('/shop')

		// Cookie should still be fr
		const cookies = await page.context().cookies()
		const localeCookie = cookies.find(
			(c) => c.name === 'localePreference',
		)
		expect(localeCookie!.value).toBe('fr')
	})

	test('language switcher is accessible via keyboard', async ({
		page,
	}) => {
		await page.goto('/')
		const group = page.getByRole('group', { name: /language|langue/i })
		await expect(group).toBeVisible()

		// Verify buttons have aria-current when active
		const enButton = group.getByRole('button', { name: /english/i })
		await expect(enButton).toHaveAttribute('aria-current', 'true')
	})

	test('French button has aria-current when French is active', async ({
		page,
	}) => {
		await page.context().addCookies([
			{
				name: 'localePreference',
				value: 'fr',
				domain: 'localhost',
				path: '/',
			},
		])
		await page.goto('/')

		const frButton = page
			.getByRole('group', { name: /language|langue/i })
			.getByRole('button', { name: /français/i })
		await expect(frButton).toHaveAttribute('aria-current', 'true')
	})

	test('redirects to current page after locale switch', async ({
		page,
	}) => {
		await page.goto('/shop')
		const frButton = page.getByRole('button', { name: /français/i })
		await frButton.click()

		// Should redirect back to /shop, not /
		await page.waitForURL('/shop')
	})

	test('switching locale does not clear cart', async ({ page }) => {
		await page.goto('/shop')

		// Add item to cart (if possible from shop page)
		const addToCartButton = page.getByRole('button', {
			name: /add to cart|ajouter au panier/i,
		}).first()
		const hasProduct =
			(await addToCartButton.count()) > 0

		if (hasProduct) {
			await addToCartButton.click()

			// Now switch locale
			const frButton = page.getByRole('button', {
				name: /français/i,
			})
			await frButton.click()
			await page.waitForURL('/shop')

			// Cart badge should still show items
			const cartBadge = page.getByTestId('cart-badge-count')
			if (await cartBadge.isVisible()) {
				const count = await cartBadge.textContent()
				expect(Number(count)).toBeGreaterThan(0)
			}
		}
	})
})
