import { test, expect } from '../playwright-utils.ts'

test.describe('Legal Page (Mentions Légales)', () => {

	test('should render the legal page with required sections', async ({ page }) => {
		await page.goto('/legal')

		// Page title
		await expect(page.getByRole('heading', { name: /mentions légales/i })).toBeVisible()

		// Required sections
		await expect(page.getByRole('heading', { name: /éditeur du site/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /hébergeur/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /propriété intellectuelle/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /données personnelles/i })).toBeVisible()
	})

	test('should display hosting provider information (Fly.io)', async ({ page }) => {
		await page.goto('/legal')

		// Hosting section must include Fly.io info
		await expect(page.getByText('Fly.io, Inc.')).toBeVisible()
		await expect(page.locator('a[href="https://fly.io"]')).toBeVisible()
	})

	test('should link to privacy page', async ({ page }) => {
		await page.goto('/legal')

		// Privacy link should exist
		const privacyLink = page.getByRole('link', { name: /politique de confidentialité/i })
		await expect(privacyLink).toBeVisible()
		await expect(privacyLink).toHaveAttribute('href', '/privacy')
	})

	test('should show placeholder message when company info is empty', async ({ page }) => {
		await page.goto('/legal')

		// When no company data is set, the page should show a placeholder message
		const placeholder = page.getByText(/informations sur l'éditeur seront renseignées/i)
		await expect(placeholder).toBeVisible()
	})
})
