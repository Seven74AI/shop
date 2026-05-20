import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { createUnsubscribeToken } from '#app/utils/unsubscribe-token.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

test.describe('Unsubscribe', () => {
	test.describe.configure({ mode: 'serial' })

	let testEmail: string
	let testUserId: string
	let validToken: string

	test.beforeAll(async () => {
		testEmail = faker.internet.email().toLowerCase()

		const user = await prisma.user.create({
			data: {
				email: testEmail,
				username: faker.internet.username(),
				marketingEmailsEnabled: true,
				emailNotificationsEnabled: true,
			},
		})
		testUserId = user.id
		validToken = createUnsubscribeToken(testUserId)
	})

	test.afterAll(async () => {
		await prisma.user.deleteMany({ where: { id: testUserId } })
	})

	test('shows confirmation page with valid token', async ({ page }) => {
		await page.goto(`/unsubscribe?token=${validToken}`)

		await expect(
			page.getByRole('heading', { name: /unsubscribe/i }),
		).toBeVisible()
		await expect(
			page.getByText(/are you sure/i),
		).toBeVisible()
		await expect(
			page.getByRole('button', { name: /unsubscribe/i }),
		).toBeVisible()
	})

	test('shows error page for invalid token', async ({ page }) => {
		await page.goto('/unsubscribe?token=invalid-token-value')

		await expect(
			page.getByRole('heading', { name: /invalid link/i }),
		).toBeVisible()
		await expect(
			page.getByText(/invalid or has expired/i),
		).toBeVisible()
	})

	test('shows error page when token is missing', async ({ page }) => {
		await page.goto('/unsubscribe')

		await expect(
			page.getByRole('heading', { name: /invalid link/i }),
		).toBeVisible()
	})

	test('unsubscribes when user clicks confirmation button', async ({
		page,
	}) => {
		// Ensure the user is still subscribed
		let user = await prisma.user.findUnique({
			where: { id: testUserId },
			select: { marketingEmailsEnabled: true },
		})
		expect(user?.marketingEmailsEnabled).toBe(true)

		await page.goto(`/unsubscribe?token=${validToken}`)

		// Click the unsubscribe button
		await page.getByRole('button', { name: /unsubscribe/i }).click()

		// Should see success message
		await expect(
			page.getByRole('heading', { name: /unsubscribed/i }),
		).toBeVisible()
		await expect(
			page.getByText(/successfully unsubscribed/i),
		).toBeVisible()

		// Verify the database flag was flipped
		user = await prisma.user.findUnique({
			where: { id: testUserId },
			select: { marketingEmailsEnabled: true },
		})
		expect(user?.marketingEmailsEnabled).toBe(false)
	})

	test('idempotent — re-click does not error', async ({ page }) => {
		await page.goto(`/unsubscribe?token=${validToken}`)

		// Click again (user is already unsubscribed)
		await page.getByRole('button', { name: /unsubscribe/i }).click()

		// Should still see success message (idempotent)
		await expect(
			page.getByRole('heading', { name: /unsubscribed/i }),
		).toBeVisible()
	})
})
