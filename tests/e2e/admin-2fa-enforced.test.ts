import { faker } from '@faker-js/faker'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

test('Admin without 2FA is redirected to enrollment on login', async ({
	page,
	navigate,
	login,
}) => {
	const password = faker.internet.password({ length: 12 })
	const user = await login({ password, asAdmin: true, skipAdmin2FA: true })
	await navigate('/')

	// Logout to clear the cookie-based session
	await page.getByRole('link', { name: 'User menu' }).click()
	await page.getByRole('menuitem', { name: /logout/i }).click()
	await expect(page).toHaveURL(`/`)

	// Login through the form (triggers handleNewSession)
	await navigate('/login')
	await expect(page).toHaveURL(`/login`)
	await page.getByRole('textbox', { name: /username/i }).fill(user.username)
	await page.getByLabel(/^password$/i).fill(password)
	await page.getByRole('button', { name: /log in/i }).click()

	// Admin without 2FA should be redirected to enrollment page
	await page.waitForURL(`/account/security/two-factor`, { timeout: 10000 })
	await expect(
		page.getByRole('button', { name: /enable 2fa/i }),
	).toBeVisible()
	await expect(
		page.getByText(/two-factor authentication/i).first(),
	).toBeVisible()
})

test('Admin without 2FA cannot access admin pages', async ({
	page,
	navigate,
	login,
}) => {
	const password = faker.internet.password({ length: 12 })
	await login({ password, asAdmin: true, skipAdmin2FA: true })

	// Try to access admin dashboard — should be redirected to enrollment
	await navigate('/admin')

	await page.waitForURL(`/account/security/two-factor`, { timeout: 10000 })
	await expect(
		page.getByRole('button', { name: /enable 2fa/i }),
	).toBeVisible()
})

test('Admin with 2FA enrolled gets full admin access', async ({
	page,
	navigate,
	login,
}) => {
	const password = faker.internet.password({ length: 12 })
	await login({ password, asAdmin: true, skipAdmin2FA: true })

	// Enroll 2FA
	await navigate('/account/security/two-factor')
	await page.getByRole('button', { name: /enable 2fa/i }).click()

	// Should redirect to verify page
	await page.waitForURL(`/account/security/two-factor/verify`, {
		timeout: 10000,
	})

	// Get OTP URI and generate code
	const main = page.getByRole('main').first()
	const otpUriString = await main
		.getByLabel(/One-Time Password URI/i)
		.innerText()
	const otpUri = new URL(otpUriString)
	const options = Object.fromEntries(otpUri.searchParams)

	await main
		.getByRole('textbox', { name: /code/i })
		.fill(
			(
				await generateTOTP({
					...options,
					algorithm: 'SHA-1',
				})
			).otp,
		)
	await main.getByRole('button', { name: /submit/i }).click()

	// Should be back on two-factor page with success message
	await page.waitForURL(`/account/security/two-factor`, { timeout: 10000 })
	await expect(
		page.getByText(/You have enabled two-factor authentication./i),
	).toBeVisible()

	// Now admin pages should work
	await navigate('/admin')
	await expect(page).toHaveURL('/admin')
})

test('Non-admin login is unaffected by admin 2FA enforcement', async ({
	page,
	navigate,
	login,
}) => {
	const password = faker.internet.password({ length: 12 })
	const user = await login({ password })
	await navigate('/')

	// Non-admin should have normal session with direct login
	await page.getByRole('link', { name: 'User menu' }).click()
	await page.getByRole('menuitem', { name: /logout/i }).click()

	// Login through form
	await navigate('/login')
	await page.getByRole('textbox', { name: /username/i }).fill(user.username)
	await page.getByLabel(/^password$/i).fill(password)
	await page.getByRole('button', { name: /log in/i }).click()

	// Non-admin should be redirected to home (no 2FA enforcement)
	await expect(page.getByRole('link', { name: 'User menu' })).toBeVisible({
		timeout: 10000,
	})
})
