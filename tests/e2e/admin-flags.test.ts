import { randomUUID } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

test.describe('Admin Feature Flags', () => {
	let currentPrefix: string
	const FLAG_PREFIX = 'admin-flags-e2e'

	test.beforeEach(async () => {
		currentPrefix = `${FLAG_PREFIX}-${randomUUID()}`
	})

	test.afterEach(async () => {
		if (!currentPrefix) return
		try {
			await prisma.flag.deleteMany({
				where: { key: { startsWith: currentPrefix } },
			})
		} catch {}
	})

	test('should redirect non-admin users from admin flags page', async ({
		page,
		login,
	}) => {
		await login()
		await page.goto('/admin/flags')
		await page.waitForLoadState('networkidle')
		await expect(
			page.getByRole('heading', { name: /unauthorized/i }),
		).toBeVisible({ timeout: 5000 })
	})

	test('should display admin flags page', async ({ page, login }) => {
		await login({ asAdmin: true })
		await page.goto('/admin/flags')
		await expect(page).toHaveURL(/\/admin\/flags/)
		await expect(
			page.getByRole('heading', { name: /feature flags/i }),
		).toBeVisible()
	})

	test('should create a new feature flag', async ({ page, login }) => {
		await login({ asAdmin: true })
		await page.goto('/admin/flags')

		const flagKey = `${currentPrefix}-test-flag`

		await page.getByPlaceholder('new_feature').fill(flagKey)
		await page.getByPlaceholder('What does this flag control?').fill('Test description')
		await page.getByRole('button', { name: /create flag/i }).click()

		await expect(page).toHaveURL(/\/admin\/flags/)
		await expect(page.getByText(flagKey)).toBeVisible()
	})

	test('should edit an existing flag', async ({ page, login }) => {
		await login({ asAdmin: true })

		const flagKey = `${currentPrefix}-edit-test`
		await prisma.flag.create({
			data: {
				key: flagKey,
				enabled: false,
				rolloutPercentage: 0,
				description: 'Before edit',
			},
		})

		await page.goto(`/admin/flags/${flagKey}/edit`)
		await expect(page.getByText(flagKey)).toBeVisible()

		await page.getByPlaceholder('What does this flag control?').fill('After edit')
		await page.getByRole('button', { name: /save changes/i }).click()

		await expect(page).toHaveURL(/\/admin\/flags/)

		// Verify edit persisted
		const updated = await prisma.flag.findUnique({
			where: { key: flagKey },
		})
		expect(updated?.description).toBe('After edit')
	})

	test('should delete a flag', async ({ page, login }) => {
		await login({ asAdmin: true })

		const flagKey = `${currentPrefix}-delete-test`
		await prisma.flag.create({
			data: {
				key: flagKey,
				enabled: false,
				rolloutPercentage: 0,
				description: 'To be deleted',
			},
		})

		await page.goto('/admin/flags')
		await expect(page.getByText(flagKey)).toBeVisible()

		// Click the delete button (trash icon)
		await page
			.locator('tr', { hasText: flagKey })
			.getByRole('button', { name: /delete/i })
			.first()
			.click()

		// Confirm deletion in dialog
		await page.getByRole('button', { name: /^delete$/i }).last().click()

		await expect(page).toHaveURL(/\/admin\/flags/)
		await expect(page.getByText(flagKey)).not.toBeVisible()
	})

	test('should toggle a flag enabled/disabled', async ({ page, login }) => {
		await login({ asAdmin: true })

		const flagKey = `${currentPrefix}-toggle-test`
		await prisma.flag.create({
			data: {
				key: flagKey,
				enabled: false,
				rolloutPercentage: 0,
				description: 'Toggle me',
			},
		})

		await page.goto('/admin/flags')

		// Find the row and click the toggle button (check icon when disabled)
		const row = page.locator('tr', { hasText: flagKey })
		await row.locator('button[name="intent"][value="toggle"]').click()

		await expect(page).toHaveURL(/\/admin\/flags/)

		// Verify it was toggled
		const updated = await prisma.flag.findUnique({
			where: { key: flagKey },
		})
		expect(updated?.enabled).toBe(true)
	})

	test('should show empty state when no flags exist', async ({
		page,
		login,
	}) => {
		await login({ asAdmin: true })
		await page.goto('/admin/flags')
		await expect(
			page.getByText(/no feature flags yet/i),
		).toBeVisible()
	})
})
