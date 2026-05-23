import { faker } from '@faker-js/faker'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

test('Users can add 2FA to their account and use it when logging in', async ({
	page,
	navigate,
	login,
}) => {
	// Increase timeout — first page load can be slow (server cold start)
	test.setTimeout(60000)
	const password = faker.internet.password()
	const user = await login({ password })

	// Warm up the server with a fast page first
	await page.goto('/')
	await expect(page.getByRole('link', { name: 'User menu' })).toBeVisible({ timeout: 10000 })

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
	await page.waitForURL(`/account/security/two-factor`, { timeout: 10000 })
	// Use the page content directly instead of main to avoid multiple main elements
	await expect(page.getByText(/You have enabled two-factor authentication./i)).toBeVisible()
	await expect(page.getByRole('link', { name: /disable 2fa/i })).toBeVisible()

	await page.getByRole('link', { name: 'User menu' }).click()
	// Wait for the dropdown to open before clicking logout
	await expect(
		page.getByRole('menuitem', { name: /logout/i }),
	).toBeVisible({ timeout: 5000 })
	await page.getByRole('menuitem', { name: /logout/i }).click()
	// Wait for the actual URL to change — logout redirect can be slow
	await page.waitForURL('/', { timeout: 15000 })

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

	await expect(page.getByRole('link', { name: 'User menu' })).toBeVisible()
})
