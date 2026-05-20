import { test, expect } from '#tests/playwright-utils.ts'

test.describe('Cookie Consent Banner', () => {
	test('shows the cookie consent banner on first visit', async ({ page }) => {
		await page.goto('/')

		// Banner should be visible
		const banner = page.getByRole('dialog', { name: 'Cookie consent' })
		await expect(banner).toBeVisible()

		// Should show Accept All, Refuse All, and Customize buttons
		await expect(
			banner.getByRole('button', { name: 'Accept All' }),
		).toBeVisible()
		await expect(
			banner.getByRole('button', { name: 'Refuse All' }),
		).toBeVisible()
		await expect(
			banner.getByRole('button', { name: 'Customize' }),
		).toBeVisible()

		// Should mention cookies and link to privacy page
		await expect(banner.getByText(/cookies/i)).toBeVisible()
		await expect(banner.getByRole('link', { name: 'Learn more' })).toBeVisible()
	})

	test('accept all sets consent cookie and hides banner', async ({ page }) => {
		await page.goto('/')

		const banner = page.getByRole('dialog', { name: 'Cookie consent' })
		await expect(banner).toBeVisible()

		// Click Accept All
		await banner.getByRole('button', { name: 'Accept All' }).click()

		// Banner should disappear
		await expect(banner).not.toBeVisible()

		// Cookie should be set with both analytics and marketing
		const cookies = await page.context().cookies()
		const consentCookie = cookies.find((c) => c.name === 'en_consent')
		expect(consentCookie).toBeDefined()
		const value = JSON.parse(
			decodeURIComponent(consentCookie!.value),
		)
		expect(value.granted).toContain('analytics')
		expect(value.granted).toContain('marketing')
		expect(value.timestamp).toBeDefined()
	})

	test('refuse all sets consent cookie with empty grants and hides banner', async ({
		page,
	}) => {
		await page.goto('/')

		const banner = page.getByRole('dialog', { name: 'Cookie consent' })
		await expect(banner).toBeVisible()

		// Click Refuse All
		await banner.getByRole('button', { name: 'Refuse All' }).click()

		// Banner should disappear
		await expect(banner).not.toBeVisible()

		// Cookie should be set with empty granted array
		const cookies = await page.context().cookies()
		const consentCookie = cookies.find((c) => c.name === 'en_consent')
		expect(consentCookie).toBeDefined()
		const value = JSON.parse(
			decodeURIComponent(consentCookie!.value),
		)
		expect(value.granted).toEqual([])
		expect(value.timestamp).toBeDefined()
	})

	test('banner does not reappear after consent is given', async ({ page }) => {
		// Set consent cookie before navigating
		const consentState = {
			timestamp: new Date().toISOString(),
			granted: ['analytics'],
		}
		await page.context().addCookies([
			{
				name: 'en_consent',
				value: encodeURIComponent(JSON.stringify(consentState)),
				domain: 'localhost',
				path: '/',
			},
		])

		await page.goto('/')

		// Banner should NOT be visible since consent is already given
		const banner = page.getByRole('dialog', { name: 'Cookie consent' })
		await expect(banner).not.toBeVisible()

		// Navigate elsewhere — banner should still not appear
		await page.goto('/shop')
		await expect(banner).not.toBeVisible()
	})

	test('customize shows category toggles', async ({ page }) => {
		await page.goto('/')

		const banner = page.getByRole('dialog', { name: 'Cookie consent' })

		// Toggles should not be visible initially
		await expect(
			banner.getByText('Analytics & Performance'),
		).not.toBeVisible()

		// Click Customize
		await banner.getByRole('button', { name: 'Customize' }).click()

		// Toggles should now be visible
		await expect(
			banner.getByText('Analytics & Performance'),
		).toBeVisible()
		await expect(banner.getByText('Marketing')).toBeVisible()
		await expect(banner.getByText('Necessary')).toBeVisible()

		// Necessary should be checked and disabled
		const necessaryCheckbox = banner.getByRole('checkbox', {
			name: 'Necessary',
		})
		await expect(necessaryCheckbox).toBeChecked()
		await expect(necessaryCheckbox).toBeDisabled()

		// Analytics and marketing should be checked by default
		await expect(
			banner.getByRole('checkbox', { name: 'Analytics & Performance' }),
		).toBeChecked()
		await expect(
			banner.getByRole('checkbox', { name: 'Marketing' }),
		).toBeChecked()

		// Uncheck marketing
		await banner
			.getByRole('checkbox', { name: 'Marketing' })
			.uncheck()

		// Save preferences
		await banner
			.getByRole('button', { name: 'Save preferences' })
			.click()

		// Banner should disappear
		await expect(banner).not.toBeVisible()

		// Cookie should only have analytics
		const cookies = await page.context().cookies()
		const consentCookie = cookies.find((c) => c.name === 'en_consent')
		expect(consentCookie).toBeDefined()
		const value = JSON.parse(
			decodeURIComponent(consentCookie!.value),
		)
		expect(value.granted).toContain('analytics')
		expect(value.granted).not.toContain('marketing')
	})
})
