import { randomUUID } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'


test.describe('Admin Order Management', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>
	let testProduct: Awaited<ReturnType<typeof prisma.product.create>>
	let currentPrefix: string
	const ORDER_PREFIX = 'admin-orders-e2e'

	test.beforeEach(async () => {
		currentPrefix = `${ORDER_PREFIX}-${randomUUID()}`
		// Create a test category
		testCategory = await prisma.category.create({
			data: {
				name: `Test Category ${currentPrefix}`,
				slug: `${currentPrefix}-category`,
				description: 'Test category for products',
			},
		})

		// Create a test product
		const productData = createProductData()
		testProduct = await prisma.product.create({
			data: {
				name: productData.name,
				slug: `${currentPrefix}-product`,
				description: productData.description,
				sku: `${currentPrefix}-sku`,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})
	})

	test.afterEach(async () => {
		// Scoped cleanup: use currentPrefix (unique per test) so parallel tests don't delete each other's data
		if (!currentPrefix) return
		try { await prisma.order.deleteMany({ where: { stripeCheckoutSessionId: { startsWith: currentPrefix } } }) } catch {}
		try { await prisma.cartItem.deleteMany({ where: { product: { sku: { startsWith: currentPrefix } } } }) } catch {}
		try { await prisma.product.deleteMany({ where: { sku: { startsWith: currentPrefix } } }) } catch {}
		try { await prisma.category.deleteMany({ where: { slug: { startsWith: currentPrefix } } }) } catch {}
	})

	test('should redirect non-admin users from admin orders page', async ({
		page,
		login,
		navigate: _navigate,
	}) => {
		await login()
		await page.goto('/admin/orders')
		await page.waitForLoadState('networkidle')
		
		// The error response data contains { error: 'Unauthorized', requiredRole: 'admin', message: ... }
		await expect(page.getByRole('heading', { name: /unauthorized/i })).toBeVisible({ timeout: 5000 })
	})

	test('should display admin order list page', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		await page.goto('/admin/orders')

		await expect(page).toHaveURL(/\/admin\/orders/)
		await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible()
	})

	test('should display all orders in the list', async ({ page, navigate: _navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		// Create admin user
		await login({ asAdmin: true })

		// Create test orders with unique order numbers
		const orderNumber1 = `${currentPrefix}-1`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				email: 'customer1@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer One',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-1`,
			},
		})

		const orderNumber2 = `${currentPrefix}-2`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber2,
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
				shippingCountry: 'US',
				status: 'SHIPPED',
				stripeCheckoutSessionId: `${currentPrefix}-session-2`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })
		
		await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible({ timeout: 10000 })

		// Check that both orders are displayed
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(orderNumber2)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText('customer1@example.com').first()).toBeVisible({ timeout: 10000 })
		await expect(page.getByText('customer2@example.com').first()).toBeVisible({ timeout: 10000 })
	})

	test('should filter orders by status (server-side, URL-based)', async ({ page, navigate: _navigate, login }) => {
		
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		// Create orders with different statuses
		const orderNumber1 = `${currentPrefix}-status-1`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				email: 'customer1@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer One',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-1`,
			},
		})
		const orderNumber2 = `${currentPrefix}-status-2`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber2,
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
				shippingCountry: 'US',
				status: 'SHIPPED',
				stripeCheckoutSessionId: `${currentPrefix}-session-2`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })

		// Verify both orders visible before filtering
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(orderNumber2)).toBeVisible({ timeout: 10000 })

		// Filter by CONFIRMED status — Select triggers server-side navigation
		const statusFilter = page.getByRole('combobox', { name: /filter by status/i })
		await statusFilter.click()
		
		// Wait for navigation when selecting a status option
		await Promise.all([
			page.waitForURL(/status=CONFIRMED/, { timeout: 10000 }),
			page.getByRole('option', { name: /confirmed/i }).click(),
		])

		// Should show only CONFIRMED orders
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(orderNumber2)).not.toBeVisible({ timeout: 5000 })
	})

	test('should search orders by order number (server-side, URL-based)', async ({ page, navigate: _navigate, login }) => {
		
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })
		const orderNumber1 = `${currentPrefix}-search-1`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				email: 'customer1@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer One',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-1`,
			},
		})

		const orderNumber2 = `${currentPrefix}-search-2`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber2,
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-2`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })
		await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible({ timeout: 10000 })

		// Verify both orders are visible initially
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(orderNumber2)).toBeVisible({ timeout: 10000 })

		// Fill search and submit the form (server-side filtering via URL params)
		const searchInput = page.getByPlaceholder(/search orders/i)
		await searchInput.fill(orderNumber1)
		
		// Submit the search form and wait for navigation with search param
		await Promise.all([
			page.waitForURL(/search=/, { timeout: 10000 }),
			page.getByRole('button', { name: /search/i }).click(),
		])

		// Should show only matching order
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(orderNumber2)).not.toBeVisible({ timeout: 5000 })
	})

	test('should search orders by email (server-side, URL-based)', async ({ page, navigate: _navigate, login }) => {
		
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		const orderNumber1 = `${ORDER_PREFIX}-${randomUUID().slice(0, 8)}-email-1`

		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				email: 'unique-email@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer One',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-1`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })

		// Fill search and submit form
		const searchInput = page
			.getByRole('textbox', { name: /search/i })
			.or(page.getByPlaceholder(/search/i))
			.first()
		await searchInput.fill('unique-email')

		// Submit and wait for navigation
		await Promise.all([
			page.waitForURL(/search=unique-email/, { timeout: 10000 }),
			page.getByRole('button', { name: /search/i }).click(),
		])

		// Should show matching order (header + one row)
		await expect(page.getByRole('row')).toHaveCount(2, { timeout: 10000 })
	})

	test('should display empty state when search has no matches (server-side)', async ({ page, navigate: _navigate, login }) => {
		await login({ asAdmin: true })

		const uniqueEmail = `empty-state-${currentPrefix}@example.com`
		await prisma.order.create({
			data: {
				orderNumber: `${currentPrefix}-empty-1`,
				email: uniqueEmail,
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-empty-session`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })
		await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible({ timeout: 10000 })

		// Search for an existing order first (should find it)
		const searchInput = page
			.getByRole('textbox', { name: /search/i })
			.or(page.getByPlaceholder(/search/i))
			.first()
		await searchInput.fill(`empty-state-${currentPrefix}`)
		await Promise.all([
			page.waitForURL(/search=/, { timeout: 10000 }),
			page.getByRole('button', { name: /search/i }).click(),
		])
		await expect(page.getByRole('row')).toHaveCount(2, { timeout: 10000 })

		// Delete the order, then search again for the same term — should show empty state
		await page.waitForLoadState('networkidle')
		await prisma.order.deleteMany({
			where: { stripeCheckoutSessionId: { startsWith: currentPrefix } },
		})

		// Navigate directly to the search URL (simulates search after deletion)
		await page.goto(`/admin/orders?search=empty-state-${currentPrefix}`, { waitUntil: 'networkidle' })
		await expect(page.getByText(/no orders match your search criteria/i)).toBeVisible({ timeout: 10000 })
	})

	test('should link to order detail page from order list', async ({ page, navigate: _navigate, login }) => {
		
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		const orderNumber = `${currentPrefix}-detail`

		await prisma.order.create({
			data: {
				orderNumber,
				email: 'customer@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-3`,
			},
		})

		await page.goto('/admin/orders')
		await page.waitForLoadState('networkidle')

		// Wait for the order to appear in the list
		await expect(page.getByText(orderNumber)).toBeVisible({ timeout: 10000 })
		
		// Click on order number link
		const orderLink = page.getByRole('link', { name: orderNumber }).first()
		
		// Ensure link is visible before clicking
		await expect(orderLink).toBeVisible({ timeout: 5000 })
		
		// Wait for navigation while clicking
		await Promise.all([
			page.waitForURL(new RegExp(`/admin/orders/${orderNumber}`), { timeout: 10000 }),
			orderLink.click()
		])

		// Should navigate to order detail page
		await expect(page).toHaveURL(new RegExp(`/admin/orders/${orderNumber}`))
	})
})
