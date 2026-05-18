import { createHash, randomUUID } from 'node:crypto'
import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { createUser, expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'
import {
	createTestUser,
	createTestUserWithRoles,
	createTestRole,
} from '#tests/user-utils.ts'

// Run admin user tests in serial — all tests share a SQLite DB and
// parallel execution causes SQLITE_BUSY on createUser/deleteMany/upsert
test.describe.configure({ mode: 'serial' })

const ADMIN_USERS_PREFIX = 'admin-users-e2e'

/**
 * Returns a test-specific prefix for cleanup. When tests run in parallel, each test
 * must only delete its own data - otherwise one test's afterEach can delete another's users.
 */
function getTestSpecificPrefix(testId: string) {
	const hash = createHash('md5').update(testId).digest('hex').slice(0, 8)
	return `${ADMIN_USERS_PREFIX}-${hash}`
}

/**
 * Creates a user with validation-compliant email and username.
 * Validation limits: username 3-20 chars [a-z0-9_], email max 100 chars, name 3-40 chars.
 * Uses test-specific prefix so parallel tests don't delete each other's data.
 */
async function createPrefixedUser(testId: string, overrides?: Parameters<typeof createTestUser>[0]) {
	const shortId = faker.string.alphanumeric(8).toLowerCase()
	const testPrefix = getTestSpecificPrefix(testId)
	// Username: max 20 chars, only letters/numbers/underscores
	const username = `admin_users_e2e_${shortId.slice(0, 4)}`
	// Email: test-specific so cleanup only deletes this test's users (parallel test isolation)
	const email = `${testPrefix}-${shortId}@example.com`
	// Name: 3-40 chars. Use overrides or a valid default
	const defaultName = `${ADMIN_USERS_PREFIX}-${shortId}`.slice(0, 40)
	const name = overrides?.name ?? overrides?.username ?? overrides?.email ?? defaultName
	// Ensure name meets validation (3-40 chars or empty)
	const validName =
		typeof name === 'string' && name.length >= 3 && name.length <= 40
			? name
			: typeof name === 'string' && name.length > 40
				? name.slice(0, 40)
				: defaultName

	return createTestUser({
		username,
		email,
		name: validName,
		...overrides,
	})
}

test.describe('Admin User Management', () => {
	test.describe.configure({ mode: 'serial' })

	test.beforeEach(async () => {
		// Ensure admin role exists
		await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin', description: 'Administrator' },
		})
	})

	test.afterEach(async ({}, testInfo) => {
		// Scoped cleanup — run individually (not in a transaction) to avoid
		// holding SQLite write locks while the server is still processing
		// page requests (SQLITE_BUSY contention)
		const testPrefix = getTestSpecificPrefix(testInfo.testId)
		try { await prisma.orderItem.deleteMany({ where: { order: { stripeCheckoutSessionId: { startsWith: testPrefix } } } }) } catch {}
		try { await prisma.order.deleteMany({ where: { stripeCheckoutSessionId: { startsWith: testPrefix } } }) } catch {}
		try { await prisma.cartItem.deleteMany({ where: { product: { sku: { startsWith: testPrefix } } } }) } catch {}
		try { await prisma.cart.deleteMany({ where: { user: { email: { startsWith: testPrefix } } } }) } catch {}
		try { await prisma.product.deleteMany({ where: { sku: { startsWith: testPrefix } } }) } catch {}
		try { await prisma.category.deleteMany({ where: { slug: { startsWith: testPrefix } } }) } catch {}
		try { await prisma.user.deleteMany({ where: { email: { startsWith: testPrefix } } }) } catch {}
		try { await prisma.role.deleteMany({ where: { name: { startsWith: `${testPrefix}-role-` } } }) } catch {}
	})

	test('should redirect non-admin users from admin users page', async ({
		page,
		login,
		navigate,
	}) => {
		await login()
		await navigate('/admin/users')
		// requireUserWithRole throws a 403 response, which React Router renders as an error page

		// Check for error content that indicates unauthorized access
		await expect(page.getByRole('heading', { name: /unauthorized/i })).toBeVisible({
			timeout: 5000,
		})
	})

	test('should display admin users list page', async ({ page, navigate, login }) => {
		// Use login fixture to create session directly (bypasses login form)
		await login({ asAdmin: true })

		await navigate('/admin/users')

		await expect(page).toHaveURL(/\/admin\/users/)
		await expect(page.getByRole('heading', { name: /users/i })).toBeVisible()
	})

	test('should display all users in the list', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		// Create test users with faker
		const { user: testUser1 } = await createPrefixedUser(test.info().testId, {
			name: faker.person.fullName(),
		})
		const { user: testUser2 } = await createPrefixedUser(test.info().testId, {
			name: faker.person.fullName(),
		})

		await navigate('/admin/users')
		// Wait for the table to be visible
		await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

		// Check that users are displayed by searching for each one
		const searchInput = page.getByPlaceholder(/search users/i)

		await searchInput.fill(testUser1.email)
		await searchInput.blur()
		await expect(
			page.getByText(new RegExp(`^${testUser1.email}$`, 'i')),
		).toBeVisible({ timeout: 10000 })

		await searchInput.fill(testUser2.email)
		await searchInput.blur()
		await expect(
			page.getByText(new RegExp(`^${testUser2.email}$`, 'i')),
		).toBeVisible({ timeout: 10000 })
	})

	test('should display user email and username', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate('/admin/users')

		// Check that email and username are displayed
		await expect(page.getByText(testUser.email)).toBeVisible()
		// Use more specific selector - username appears in its own cell
		const usernameCell = page.getByRole('cell', { name: new RegExp(`^${testUser.username}$`) })
		await expect(usernameCell).toBeVisible()
	})

	test('should display user roles', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const testPrefix = getTestSpecificPrefix(test.info().testId)
		const testRole = await createTestRole({
			name: `${testPrefix}-role-${faker.string.alphanumeric(4)}`,
		})

		// Create user with role
		await createTestUserWithRoles([testRole.name])

		await navigate('/admin/users')

		// Check that role is displayed
		await expect(page.getByText(testRole.name)).toBeVisible()
	})


	test('should search users by name', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		// Use unique names to avoid conflicts
		const aliceName = `Alice ${faker.string.alphanumeric(8)}`
		const bobName = `Bob ${faker.string.alphanumeric(8)}`

		await createPrefixedUser(test.info().testId, { name: aliceName })
		await createPrefixedUser(test.info().testId, { name: bobName })

		await navigate('/admin/users')

		// Wait for users list to load
		await expect(page.getByRole('heading', { name: /users/i })).toBeVisible({ timeout: 10000 })

		// Verify both users are visible initially - wait for state, not time
		await expect(page.getByText(aliceName, { exact: false })).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(bobName, { exact: false })).toBeVisible({ timeout: 10000 })

		// Search for Alice by first name only
		const searchInput = page.getByPlaceholder(/search users/i)
		await searchInput.fill('Alice')
		await searchInput.blur() // Trigger change event

		// Wait for React to update the filtered list - wait for state, not time
		await expect(page.getByText(aliceName, { exact: false })).toBeVisible({ timeout: 5000 })

		// Check that Alice is visible
		await expect(page.getByText(aliceName, { exact: false })).toBeVisible({ timeout: 5000 })
		
		// Bob should not be visible - wait for him to disappear
		await expect(page.getByText(bobName, { exact: false })).not.toBeVisible({ timeout: 5000 })
	})

	test('should search users by email', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate('/admin/users')

		// Search by email domain
		const emailDomain = testUser.email.split('@')[1]
		if (emailDomain) {
			await page.getByPlaceholder(/search users/i).fill(emailDomain)

			// Wait for search to apply - wait for state, not time
			await expect(page.getByText(testUser.email)).toBeVisible({ timeout: 5000 })

			// Check that user is visible
			await expect(page.getByText(testUser.email)).toBeVisible()
		}
	})

	test('should display user detail page with profile information', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate(('/admin/users/' + testUser.id) as any)

		// Wait for page to load and heading to appear
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Check that user details are displayed - use accessible queries
		// The user details are in a card with "Profile Details" heading
		await expect(page.getByRole('heading', { name: /profile details/i })).toBeVisible({ timeout: 10000 })
		
		// Email appears in both header and profile details - use first() to handle multiple matches
		await expect(page.getByText(testUser.email).first()).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(testUser.username).first()).toBeVisible({ timeout: 10000 })
		// Name is optional, so only check if it exists
		if (testUser.name) {
			await expect(page.getByText(testUser.name).first()).toBeVisible({ timeout: 10000 })
		}
	})

	test('should display user statistics', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate(('/admin/users/' + testUser.id) as any)

		// Wait for page to load and heading to appear
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Check that statistics section is displayed using role-based locators
		await expect(page.getByText(/total orders/i).first()).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(/active sessions/i).first()).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(/total sessions/i).first()).toBeVisible({ timeout: 10000 })
	})

	test('should display user orders in detail page', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const testPrefix = getTestSpecificPrefix(test.info().testId)

		// Create test category and product with faker
		const categoryName = `${testPrefix}-category`
		const category = await prisma.category.create({
			data: {
				name: categoryName,
				slug: `${testPrefix}-category`,
				description: faker.lorem.sentence(),
			},
		})

		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: `${testPrefix}-product`,
				description: productData.description,
				sku: `${testPrefix}-sku-${randomUUID()}`,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		// Create an order for the user
		const order = await prisma.order.create({
			data: {
				orderNumber: await generateOrderNumber(),
				userId: testUser.id,
				email: testUser.email,
				subtotal: faker.number.int({ min: 1000, max: 100000 }),
				total: faker.number.int({ min: 1000, max: 100000 }),
				shippingName: testUser.name || testUser.username,
				shippingStreet: faker.location.streetAddress(),
				shippingCity: faker.location.city(),
				shippingPostal: faker.location.zipCode(),
				shippingCountry: faker.location.countryCode(),
				status: 'PENDING',
				stripeCheckoutSessionId: `${testPrefix}-${faker.string.alphanumeric(24)}`,
				items: {
					create: {
						productId: product.id,
						quantity: faker.number.int({ min: 1, max: 5 }),
						price: product.price,
					},
				},
			},
		})

		await navigate(('/admin/users/' + testUser.id) as any)

		// Check that order is displayed - explicit wait for async load
		await expect(page.getByText(order.orderNumber)).toBeVisible({ timeout: 10000 })
	})

	test('should return 404 for non-existent user', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		await navigate('/admin/users/non-existent-user-id' as any)

		// Should show 404 error
		await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 5000 })
	})
})

test.describe('Admin User Edit', () => {
	test.describe.configure({ mode: 'serial' })

	test.beforeEach(async () => {
		// Ensure admin role exists
		await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin', description: 'Administrator' },
		})
	})

	test.afterEach(async ({}, testInfo) => {
		// Scoped cleanup — run individually (not in a transaction) to avoid
		// holding SQLite write locks while the server is still processing
		// page requests (SQLITE_BUSY contention)
		const testPrefix = getTestSpecificPrefix(testInfo.testId)
		try { await prisma.orderItem.deleteMany({ where: { order: { stripeCheckoutSessionId: { startsWith: testPrefix } } } }) } catch {}
		try { await prisma.order.deleteMany({ where: { stripeCheckoutSessionId: { startsWith: testPrefix } } }) } catch {}
		try { await prisma.cartItem.deleteMany({ where: { product: { sku: { startsWith: testPrefix } } } }) } catch {}
		try { await prisma.cart.deleteMany({ where: { user: { email: { startsWith: testPrefix } } } }) } catch {}
		try { await prisma.product.deleteMany({ where: { sku: { startsWith: testPrefix } } }) } catch {}
		try { await prisma.category.deleteMany({ where: { slug: { startsWith: testPrefix } } }) } catch {}
		try { await prisma.user.deleteMany({ where: { email: { startsWith: testPrefix } } }) } catch {}
		try { await prisma.role.deleteMany({ where: { name: { startsWith: `${testPrefix}-role-` } } }) } catch {}
	})

	test('should redirect to login if not authenticated', async ({ page }) => {
		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		await page.waitForURL(/\/login/)
		await expect(page).toHaveURL(/\/login/)
	})

	test('should redirect non-admin users', async ({ page, login, navigate }) => {
		await login()
		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		await expect(page.getByRole('heading', { name: /unauthorized/i })).toBeVisible({
			timeout: 5000,
		})
	})

	test('should load edit page with user data pre-filled', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)

		await expect(page).toHaveURL(new RegExp(`/admin/users/${testUser.id}/edit`))
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for form fields to be visible instead of checking for form role
		// This is more reliable when tests run in parallel
		const nameInput = page.getByLabel(/^name$/i)
		const emailInput = page.getByLabel(/^email/i)
		const usernameInput = page.getByLabel(/^username/i)
		
		await expect(emailInput).toBeVisible({ timeout: 10000 })
		await expect(usernameInput).toBeVisible({ timeout: 10000 })

		if (testUser.name) {
			await expect(nameInput).toHaveValue(testUser.name)
		}
		await expect(emailInput).toHaveValue(testUser.email)
		await expect(usernameInput).toHaveValue(testUser.username)
	})

	test('should update user name', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const originalName = faker.person.fullName()
		const { user: testUser } = await createPrefixedUser(test.info().testId, { name: originalName })

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// Verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })

		// Wait for form fields to be visible
		const nameInput = page.getByLabel(/^name$/i)
		await expect(nameInput).toBeVisible({ timeout: 10000 })

		// Update name - ensure it's at least 3 characters (validation requirement)
		const updatedName = faker.person.fullName()
		// Ensure name meets validation (3-40 characters)
		const validName = updatedName.length >= 3 && updatedName.length <= 40 
			? updatedName 
			: updatedName.substring(0, 40)
		await nameInput.fill(validName)
		
		// Submit form and wait for navigation
		await Promise.all([
			page.waitForURL(new RegExp(`/admin/users/${testUser.id}/?$`), { timeout: 20000 }),
			page.getByRole('button', { name: /save changes/i }).click(),
		])
		
		// Wait for page to fully load
		
		// Verify we're on the user detail page - check URL first
		await expect(page).toHaveURL(new RegExp(`/admin/users/${testUser.id}/?$`), { timeout: 10000 })
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Verify the updated name appears on the page - test from user's perspective
		// The heading shows name || username, so if name was set, it should appear in heading
		const heading = page.getByRole('heading', { level: 1 })
		await expect(heading).toContainText(validName, { timeout: 10000 })
	})

	test('should update user email', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// First verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for email field to be visible
		const emailInput = page.getByLabel(/^email/i)
		await expect(emailInput).toBeVisible({ timeout: 10000 })

		// Generate a new unique email
		const newEmail = faker.internet.email({ provider: 'example.com' })
		await emailInput.fill(newEmail)
		
		// Submit form and wait for navigation
		await Promise.all([
			page.waitForURL(new RegExp(`/admin/users/${testUser.id}/?$`), { timeout: 20000 }),
			page.getByRole('button', { name: /save changes/i }).click(),
		])
		
		// Wait for page to fully load
		
		// Verify we're on the user detail page (not edit page)
		await expect(page.getByRole('heading', { name: /edit user/i })).not.toBeVisible({ timeout: 5000 })
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Verify email appears on the page - use first() to handle multiple matches (header + detail)
		await expect(page.getByText(newEmail, { exact: false }).first()).toBeVisible({ timeout: 10000 })
	})

	test('should update user username', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// First verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for username field to be visible
		const usernameInput = page.getByLabel(/^username/i)
		await expect(usernameInput).toBeVisible({ timeout: 10000 })

		// Update username - createTestUser ensures it's within 20 char limit
		const { username: newUsername } = await createUser()
		await usernameInput.fill(newUsername)
		
		// Submit form and wait for navigation
		await Promise.all([
			page.waitForURL(new RegExp(`/admin/users/${testUser.id}/?$`), { timeout: 20000 }),
			page.getByRole('button', { name: /save changes/i }).click(),
		])
		
		// Wait for page to fully load
		
		// Verify we're on the user detail page (not edit page)
		await expect(page.getByRole('heading', { name: /edit user/i })).not.toBeVisible({ timeout: 5000 })
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Verify username appears on the page - check heading or detail section
		await expect(page.getByText(newUsername, { exact: false }).first()).toBeVisible({ timeout: 10000 })
	})

	test('should add role to user', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const testPrefix = getTestSpecificPrefix(test.info().testId)
		const testRole = await createTestRole({
			name: `${testPrefix}-role-${faker.string.alphanumeric(4)}`,
		})

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		// Wait for form to be ready - check for a form field or button
		await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible({ timeout: 10000 })

		// Check the role checkbox
		await page.getByLabel(testRole.name).check()
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`))
		await expect(page.getByText(testRole.name)).toBeVisible()
	})

	test('should remove role from user', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const testPrefix = getTestSpecificPrefix(test.info().testId)
		const testRole = await createTestRole({
			name: `${testPrefix}-role-${faker.string.alphanumeric(4)}`,
		})

		const { user: testUser } = await createTestUserWithRoles([testRole.name])

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// First verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for role checkbox to be visible
		await expect(page.getByLabel(testRole.name)).toBeVisible({ timeout: 10000 })

		// Uncheck the role checkbox
		await page.getByLabel(testRole.name).uncheck()
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}/?$`), { timeout: 20000 })
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		// Role should not be visible - wait for it to disappear
		await expect(page.getByText(testRole.name)).not.toBeVisible({ timeout: 5000 })
	})

	test('should update multiple roles', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const testPrefix = getTestSpecificPrefix(test.info().testId)
		const role1 = await createTestRole({
			name: `${testPrefix}-role-${faker.string.alphanumeric(4)}`,
		})
		const role2 = await createTestRole({
			name: `${testPrefix}-role-${faker.string.alphanumeric(4)}`,
		})

		const { user: testUser } = await createTestUserWithRoles([role1.name])

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// First verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for role checkboxes to be visible - use getByRole for checkbox with name from label
		const role1Checkbox = page.getByRole('checkbox', { name: role1.name })
		const role2Checkbox = page.getByRole('checkbox', { name: role2.name })
		await expect(role1Checkbox).toBeVisible({ timeout: 10000 })
		await expect(role2Checkbox).toBeVisible({ timeout: 10000 })

		// Check role2 and keep role1 checked
		await role2Checkbox.check()
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}/?$`), { timeout: 20000 })
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(role1.name)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(role2.name)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for duplicate email', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: existingUser } = await createPrefixedUser(test.info().testId)
		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// First verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for email field to be visible
		const emailInput = page.getByLabel(/^email/i)
		await expect(emailInput).toBeVisible({ timeout: 10000 })

		// Try to use existing user's email
		await emailInput.fill(existingUser.email)
		
		// Submit form - should NOT redirect on validation error
		await Promise.all([
			page.getByRole('button', { name: /save changes/i }).click(),
		])
		
		// Should stay on edit page and show validation error (no redirect)
		// Verify we're still on edit page (not redirected)
		await expect(page).toHaveURL(new RegExp(`/admin/users/${testUser.id}/edit`), { timeout: 10000 })
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Check for validation error - errors appear near the input field or in ErrorList
		// The error message is "A user already exists with this email"
		const errorText = page.getByText(/A user already exists with this email/i)
			.or(page.getByText(/email.*already exists/i))
			.or(page.getByRole('alert'))
		
		await expect(errorText.first()).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for duplicate username', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: existingUser } = await createPrefixedUser(test.info().testId)
		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// First verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for username field to be visible
		const usernameInput = page.getByLabel(/^username/i)
		await expect(usernameInput).toBeVisible({ timeout: 10000 })

		// Try to use existing user's username
		await usernameInput.fill(existingUser.username)
		
		// Submit form - should NOT redirect on validation error
		await Promise.all([
			page.getByRole('button', { name: /save changes/i }).click(),
		])

		// Should stay on edit page and show validation error (no redirect)
		// Verify we're still on edit page (not redirected)
		await expect(page).toHaveURL(new RegExp(`/admin/users/${testUser.id}/edit`), { timeout: 10000 })
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Check for validation error - errors appear near the input field or in ErrorList
		// The error message is "A user already exists with this username"
		const errorText = page.getByText(/A user already exists with this username/i)
			.or(page.getByText(/username.*already exists/i))
			.or(page.getByRole('alert'))
		
		await expect(errorText.first()).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for invalid email format', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		// Wait for form fields to be visible - more reliable than checking form role
		await expect(page.getByLabel(/^email/i)).toBeVisible({ timeout: 10000 })

		// Enter invalid email
		await page.getByLabel(/^email/i).fill('invalid-email')
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await expect(page.getByText(/email.*invalid|invalid.*email/i)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for invalid username format', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		// Wait for form to be ready - check for username field
		await expect(page.getByLabel(/^username/i)).toBeVisible({ timeout: 10000 })

		// Enter invalid username (with special characters)
		await page.getByLabel(/^username/i).fill('invalid@username')
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await expect(page.getByText(/username.*can only include|invalid.*username/i)).toBeVisible({ timeout: 10000 })
	})

	test('should redirect to user detail page after successful update', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// Verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for name field to be visible
		const nameInput = page.getByLabel(/^name$/i)
		await expect(nameInput).toBeVisible({ timeout: 10000 })

		// Update name - ensure it meets validation (3-40 characters)
		const updatedName = faker.person.fullName()
		const validName = updatedName.length >= 3 && updatedName.length <= 40 
			? updatedName 
			: updatedName.substring(0, 40)
		await nameInput.fill(validName)
		
		// Submit form and wait for navigation
		await Promise.all([
			page.waitForURL(new RegExp(`/admin/users/${testUser.id}/?$`), { timeout: 20000 }),
			page.getByRole('button', { name: /save changes/i }).click(),
		])

		// Wait for page to fully load
		
		// Verify we're on the user detail page (not edit page)
		await expect(page.getByRole('heading', { name: /edit user/i })).not.toBeVisible({ timeout: 5000 })
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Verify the name appears on the page - test from user's perspective
		// The heading shows name || username, so check if name appears
		const heading = page.getByRole('heading', { level: 1 })
		await expect(heading).toContainText(validName, { timeout: 10000 })
	})

	test('should show toast notification on success', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		
		// Verify we're on the edit page
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		
		// Wait for name field to be visible
		const nameInput = page.getByLabel(/^name$/i)
		await expect(nameInput).toBeVisible({ timeout: 10000 })

		// Update name - ensure it meets validation (3-40 characters)
		const updatedName = faker.person.fullName()
		const validName = updatedName.length >= 3 && updatedName.length <= 40 
			? updatedName 
			: updatedName.substring(0, 40)
		await nameInput.fill(validName)
		
		// Submit form and wait for navigation
		await Promise.all([
			page.waitForURL(new RegExp(`/admin/users/${testUser.id}/?$`), { timeout: 20000 }),
			page.getByRole('button', { name: /save changes/i }).click(),
		])

		// Wait for page to fully load
		
		// Verify we're on the user detail page (not edit page)
		await expect(page.getByRole('heading', { name: /edit user/i })).not.toBeVisible({ timeout: 5000 })
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Verify the data was actually updated - test from user's perspective
		const heading = page.getByRole('heading', { level: 1 })
		await expect(heading).toContainText(validName, { timeout: 10000 })
		
		// Check for toast notification - wait for state, not time
		// Toast might appear as alert role or text
		const toast = page.getByText(/updated successfully|user updated/i)
			.or(page.getByRole('alert'))
		await expect(toast.first()).toBeVisible({ timeout: 10000 })
	})

	test('should return 404 for non-existent user', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		await navigate('/admin/users/non-existent-user-id/edit' as any)

		// Should show 404 error
		await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 5000 })
	})
})

