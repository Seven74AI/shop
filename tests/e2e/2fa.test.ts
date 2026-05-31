import { faker } from '@faker-js/faker'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

test('Users can add 2FA to their account and use it when logging in', async ({
	page,
	navigate,
	login,
}) => {
	// Increase timeout — CI environments are slow (server cold start + cold DB)
	test.setTimeout(90000)
	// Force English locale for deterministic test text
	await page.context().addCookies([{
		name: 'localePreference',
		value: 'en',
		domain: 'localhost',
		path: '/',
	}])
	const password = faker.internet.password()
	const user = await login({ password })

	// Warm up the server with a fast page first
	await page.goto('/')
	await expect(page.getByLabel('User menu')).toBeVisible({ timeout: 15000 })

	await navigate('/account/security/two-factor')

	// Wait for the page to fully load before interacting
	await expect(page.getByRole('heading', { name: /two-factor/i })).toBeVisible({ timeout: 30000 })
	await page.getByRole('button', { name: /enable 2fa/i }).click()

	// After clicking enable, should redirect to verify page
	await page.waitForURL(`/account/security/two-factor/verify`, { timeout: 10000 })
	
	// Use the first main element (the page content) to avoid multiple main elements
	const main = page.getByRole('main').first()
	const otpUriString = await main
		.getByLabel(/One-Time Password URI/i)
		.innerText()

	const otpUri = new URL(otpUriString)
	const options = Object.fromEntries(otpUri.searchParams)

	await main.getByRole('textbox', { name: /code/i }).fill(
		(
			await generateTOTP({
				...options,
				// the algorithm will be "SHA1" but we need to generate the OTP with "SHA-1"
				algorithm: 'SHA-1',
			})
		).otp,
	)
	await main.getByRole('button', { name: /submit/i }).click()

	// Wait for the redirect back to the two-factor page after verification
	await page.waitForURL(`/account/security/two-factor`, { timeout: 15000 })
	// Use the page content directly instead of main to avoid multiple main elements
	await expect(page.getByText(/You have enabled two-factor authentication./i)).toBeVisible({ timeout: 10000 })
	await expect(page.getByRole('link', { name: /disable 2fa/i })).toBeVisible()

	// Click the user menu trigger (uses aria-label="User menu")
	await page.getByLabel('User menu').click()
	// Wait for the dropdown to open — search for the logout button directly
	await expect(
		page.getByRole('menuitem', { name: /log out/i }),
	).toBeVisible({ timeout: 10000 })
	await page.getByRole('menuitem', { name: /log out/i }).click()
	// Wait for the actual URL to change — logout redirect can be slow
	await page.waitForURL('/', { timeout: 20000 })
	await expect(page).toHaveURL('/')

	await navigate('/login')
	await expect(page).toHaveURL(`/login`)
	await page.getByRole('textbox', { name: /username/i }).fill(user.username)
	await page.getByLabel(/^password$/i).fill(password)
	await page.getByRole('button', { name: /log in/i }).click()

	await page.getByRole('textbox', { name: /code/i }).fill(
		(
			await generateTOTP({
				...options,
				// the algorithm will be "SHA1" but we need to generate the OTP with "SHA-1"
				algorithm: 'SHA-1',
			})
		).otp,
	)

	await page.getByRole('button', { name: /submit/i }).click()

	await expect(page.getByLabel('User menu')).toBeVisible({ timeout: 15000 })
})
