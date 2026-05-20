import { faker } from '@faker-js/faker'
import { expect, test } from '#tests/playwright-utils.ts'
import { MAX_LOGIN_ATTEMPTS } from '#app/utils/auth.server.ts'

test.describe('Account lockout on failed login', () => {
	test('locks account after too many failed login attempts', async ({
		page,
		navigate,
		insertNewUser,
	}) => {
		const password = faker.internet.password()
		const wrongPassword = 'definitely-wrong-password'
		const user = await insertNewUser({ password })

		await navigate('/login')

		// Attempt login with wrong password MAX_LOGIN_ATTEMPTS times
		for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
			await page.getByRole('textbox', { name: /username/i }).fill(user.username)
			await page.getByLabel(/^password$/i).fill(wrongPassword)
			await page.getByRole('button', { name: /log in/i }).click()

			// Should show error message
			await expect(
				page.getByText(/invalid username or password/i),
			).toBeVisible()

			// Clear fields for next attempt
			await page.getByRole('textbox', { name: /username/i }).clear()
			await page.getByLabel(/^password$/i).clear()
		}

		// Next attempt should show the lockout message
		await page.getByRole('textbox', { name: /username/i }).fill(user.username)
		await page.getByLabel(/^password$/i).fill(wrongPassword)
		await page.getByRole('button', { name: /log in/i }).click()

		await expect(
			page.getByText(
				/account temporarily locked due to too many failed login attempts/i,
			),
		).toBeVisible()

		// Even correct password should be rejected while locked
		await page.getByRole('textbox', { name: /username/i }).clear()
		await page.getByLabel(/^password$/i).clear()
		await page.getByRole('textbox', { name: /username/i }).fill(user.username)
		await page.getByLabel(/^password$/i).fill(password)
		await page.getByRole('button', { name: /log in/i }).click()

		await expect(
			page.getByText(
				/account temporarily locked due to too many failed login attempts/i,
			),
		).toBeVisible()
	})

	test('resets lockout counter on successful login before threshold', async ({
		page,
		navigate,
		insertNewUser,
	}) => {
		const password = faker.internet.password()
		const wrongPassword = 'definitely-wrong-password'
		const user = await insertNewUser({ password })

		await navigate('/login')

		// Fail a couple of times
		for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 2; i++) {
			await page.getByRole('textbox', { name: /username/i }).fill(user.username)
			await page.getByLabel(/^password$/i).fill(wrongPassword)
			await page.getByRole('button', { name: /log in/i }).click()
			await expect(
				page.getByText(/invalid username or password/i),
			).toBeVisible()
			await page.getByRole('textbox', { name: /username/i }).clear()
			await page.getByLabel(/^password$/i).clear()
		}

		// Successful login should reset the counter
		await page.getByRole('textbox', { name: /username/i }).fill(user.username)
		await page.getByLabel(/^password$/i).fill(password)
		await page.getByRole('button', { name: /log in/i }).click()

		await expect(page).toHaveURL(`/`)
		await expect(page.getByRole('link', { name: 'User menu' })).toBeVisible()
	})
})
