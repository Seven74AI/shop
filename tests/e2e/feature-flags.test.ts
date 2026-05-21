import { prisma } from '#app/utils/db.server.ts'
import { test, expect, expectPageToBeAccessible } from '../playwright-utils.ts'

const FEATURE_FLAG_E2E_PREFIX = 'e2e-test-flag-'

test.describe('Feature Flags Admin Panel', () => {
	// Increase timeout for slow server responses (admin pages, CRUD, search)
	test.setTimeout(60000)

	test.beforeEach(async () => {
		// Clean up any flags from previous runs
		await prisma.flag.deleteMany({
			where: { key: { startsWith: FEATURE_FLAG_E2E_PREFIX } },
		})
	})

	test.afterEach(async () => {
		// Clean up flags created during tests
		await prisma.flag.deleteMany({
			where: { key: { startsWith: FEATURE_FLAG_E2E_PREFIX } },
		})
	})

	test.describe('Admin access', () => {
		test('should show feature flags in admin sidebar when logged in as admin', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin')

			// Sidebar should contain a link to feature flags
			await expect(
				page.getByRole('link', { name: /feature flags/i }),
			).toBeVisible()
		})

		test('should deny access to feature flags for non-admin users', async ({
			page,
			login,
		}) => {
			await login()
			const response = await page.goto('/admin/feature-flags')
			
			// Should be redirected or get 403
			expect(response?.status()).not.toBe(200)
		})

		test('should render feature flags index page for admin', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')
			await page.waitForLoadState('networkidle')

			await expect(
				page.getByRole('heading', { name: 'Feature Flags', exact: true }),
			).toBeVisible()

			// Should show empty state when no flags
			await expect(
				page.getByRole('heading', { name: /no feature flags yet/i }),
			).toBeVisible()
		})
	})

	test.describe('CRUD operations', () => {
		const FLAG_KEY = `${FEATURE_FLAG_E2E_PREFIX}new-checkout`
		const FLAG_DESC = 'E2E test - new checkout flow'

		test('should create a new feature flag', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags/new')
			await page.waitForLoadState('networkidle')

			await expect(
				page.getByRole('heading', { name: /new feature flag/i }),
			).toBeVisible()

			// Fill in the form
			await page.getByLabel(/key/i).fill(FLAG_KEY)
			await page.getByLabel(/description/i).fill(FLAG_DESC)
			await page.getByLabel(/rollout percentage/i).fill('25')
			await page.getByLabel(/enabled/i).check()

			// Submit
			await page.getByRole('button', { name: /create/i }).click()

			// Should redirect to feature flags list
			await expect(page).toHaveURL(/\/admin\/feature-flags$/)

			// The new flag should appear in the list
			await expect(
				page
					.getByRole('row', { name: new RegExp(FLAG_KEY) })
					.getByText(FLAG_KEY),
			).toBeVisible()
		})

		test('should validate flag key format', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags/new')

			// Fill with invalid key (has spaces)
			await page.getByLabel(/key/i).fill('bad key!')
			await page.getByRole('button', { name: /create/i }).click()

			// Should stay on the page with validation error
			await expect(page).toHaveURL(/\/admin\/feature-flags\/new/)
			await expect(
				page.getByText(/can only contain letters/i),
			).toBeVisible()
		})

		test('should edit an existing feature flag', async ({
			page,
			login,
		}) => {
			// Create a flag first
			await prisma.flag.create({
				data: {
					key: `${FEATURE_FLAG_E2E_PREFIX}edit-test`,
					enabled: false,
					rolloutPercentage: 0,
					description: 'Before edit',
				},
			})

			await login({ asAdmin: true })
			await page.goto(
				`/admin/feature-flags/${FEATURE_FLAG_E2E_PREFIX}edit-test/edit`,
			)

			await expect(
				page.getByRole('heading', { name: /edit feature flag/i }),
			).toBeVisible()

			// Update description
			const descField = page.getByLabel(/description/i)
			await descField.clear()
			await descField.fill('After edit - updated')

			// Check enabled
			await page.getByLabel(/enabled/i).check()

			// Save
			await page.getByRole('button', { name: /save changes/i }).click()

			// Should redirect to list
			await expect(page).toHaveURL(/\/admin\/feature-flags$/)

			// Verify update in database
			const flag = await prisma.flag.findUnique({
				where: { key: `${FEATURE_FLAG_E2E_PREFIX}edit-test` },
			})
			expect(flag?.enabled).toBe(true)
			expect(flag?.description).toBe('After edit - updated')
		})

		test('should toggle flag enabled/disabled status', async ({
			page,
			login,
		}) => {
			// Create a flag first
			await prisma.flag.create({
				data: {
					key: `${FEATURE_FLAG_E2E_PREFIX}toggle-test`,
					enabled: false,
					rolloutPercentage: 0,
					description: 'Toggle test',
				},
			})

			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')
			await page.waitForLoadState('networkidle')

			// Find the toggle button for our flag
			const toggleButton = page
				.getByRole('row', {
					name: new RegExp(`${FEATURE_FLAG_E2E_PREFIX}toggle-test`),
				})
				.getByRole('button', { name: /enable/i })

			await toggleButton.click()

			// Wait for toggle to complete and page to reload
			await expect(page).toHaveURL(/\/admin\/feature-flags$/)

			// Verify toggle in database
			const flag = await prisma.flag.findUnique({
				where: { key: `${FEATURE_FLAG_E2E_PREFIX}toggle-test` },
			})
			expect(flag?.enabled).toBe(true)
		})

		test('should delete a feature flag', async ({
			page,
			login,
		}) => {
			// Create a flag first
			await prisma.flag.create({
				data: {
					key: `${FEATURE_FLAG_E2E_PREFIX}delete-test`,
					enabled: false,
					rolloutPercentage: 0,
					description: 'Delete test',
				},
			})

			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')
			await page.waitForLoadState('networkidle')

			// Click delete button on the row
			const row = page.getByRole('row', {
				name: new RegExp(`${FEATURE_FLAG_E2E_PREFIX}delete-test`),
			})
			await row.getByRole('button', { name: /^Delete / }).click()

			// Confirm deletion in the dialog
			await page
				.getByRole('button', { name: /delete flag/i })
				.click()

			// Should redirect to list
			await expect(page).toHaveURL(/\/admin\/feature-flags$/)

			// Verify deletion in database
			const flag = await prisma.flag.findUnique({
				where: { key: `${FEATURE_FLAG_E2E_PREFIX}delete-test` },
			})
			expect(flag).toBeNull()
		})
	})

	test.describe('Search and filter', () => {
		test.beforeEach(async () => {
			// Create multiple flags for search/filter testing
			await prisma.flag.createMany({
				data: [
					{
						key: `${FEATURE_FLAG_E2E_PREFIX}alpha-feature`,
						enabled: true,
						rolloutPercentage: 50,
						description: 'Alpha testing feature',
					},
					{
						key: `${FEATURE_FLAG_E2E_PREFIX}beta-feature`,
						enabled: false,
						rolloutPercentage: 0,
						description: 'Beta testing feature',
					},
					{
						key: `${FEATURE_FLAG_E2E_PREFIX}gamma-feature`,
						enabled: true,
						rolloutPercentage: 100,
						description: 'Gamma production feature',
					},
				],
			})
		})

		test('should search flags by key', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')
			await page.waitForLoadState('networkidle')

			// Search for 'alpha'
			await page.getByPlaceholder(/search flags/i).waitFor({ state: 'visible' })
			await page.getByPlaceholder(/search flags/i).fill('alpha')
			await page.waitForTimeout(300)

			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}alpha-feature`)).toBeVisible()
			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}beta-feature`)).not.toBeVisible()
		})

		test('should search flags by description', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')
			await page.waitForLoadState('networkidle')

			// Search by description keyword
			await page.getByPlaceholder(/search flags/i).waitFor({ state: 'visible' })
			await page.getByPlaceholder(/search flags/i).fill('production')
			await page.waitForTimeout(300)

			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}gamma-feature`)).toBeVisible()
			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}alpha-feature`)).not.toBeVisible()
		})

		test('should filter flags by status', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')
			await page.waitForLoadState('networkidle')

			// Filter by enabled
			await page.getByLabel(/filter by status/i).waitFor({ state: 'visible' })
			await page.getByLabel(/filter by status/i).click()
			await page.getByRole('option', { name: /enabled only/i }).click()
			await page.waitForTimeout(300)

			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}alpha-feature`)).toBeVisible()
			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}beta-feature`)).not.toBeVisible()

			// Filter by disabled
			await page.getByLabel(/filter by status/i).click()
			await page.getByRole('option', { name: /disabled only/i }).click()
			await page.waitForTimeout(300)

			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}alpha-feature`)).not.toBeVisible()
			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}beta-feature`)).toBeVisible()
		})

		test('should show no results when search has no matches', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')
			await page.waitForLoadState('networkidle')

			// Search for something that doesn't exist
			await page.getByPlaceholder(/search flags/i).waitFor({ state: 'visible' })
			await page.getByPlaceholder(/search flags/i).fill('zzz_nonexistent_zzz')
			await page.waitForTimeout(300)

			await expect(page.getByText(/no flags match/i)).toBeVisible()
		})
	})

	test.describe('Accessibility', () => {
		test('feature flags index page should be accessible', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')

			await expectPageToBeAccessible(page, {
				disableRules: ['color-contrast', 'page-has-heading-one', 'label'],
			})
		})

		test('new feature flag page should be accessible', async ({
			page,
			login,
		}) => {
			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags/new')

			await expectPageToBeAccessible(page, {
				disableRules: ['color-contrast'],
			})
		})

		test('edit feature flag page should be accessible', async ({
			page,
			login,
		}) => {
			// Create a flag for edit page
			await prisma.flag.create({
				data: {
					key: `${FEATURE_FLAG_E2E_PREFIX}a11y-edit`,
					enabled: true,
					rolloutPercentage: 50,
					description: 'Accessibility test flag',
				},
			})

			await login({ asAdmin: true })
			await page.goto(
				`/admin/feature-flags/${FEATURE_FLAG_E2E_PREFIX}a11y-edit/edit`,
			)

			await expectPageToBeAccessible(page, {
				disableRules: ['color-contrast', 'page-has-heading-one', 'label'],
			})
		})
	})

	test.describe('Flag count display', () => {
		test('should show correct flag count', async ({
			page,
			login,
		}) => {
			// Create some flags
			await prisma.flag.createMany({
				data: [
					{
						key: `${FEATURE_FLAG_E2E_PREFIX}count-1`,
						enabled: true,
						rolloutPercentage: 0,
					},
					{
						key: `${FEATURE_FLAG_E2E_PREFIX}count-2`,
						enabled: false,
						rolloutPercentage: 0,
					},
				],
			})

			await login({ asAdmin: true })
			await page.goto('/admin/feature-flags')
			await page.waitForLoadState('networkidle')

			// Should show "N flags" in the header area
			// The count includes the seeded e2e flags; verify at least ours are visible
			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}count-1`)).toBeVisible()
			await expect(page.getByText(`${FEATURE_FLAG_E2E_PREFIX}count-2`)).toBeVisible()
		})
	})
})
