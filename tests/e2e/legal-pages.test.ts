import { randomUUID } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

test.describe('Footer Legal Links', () => {
	test('should display legal links in footer on public pages', async ({ page }) => {
		await page.goto('/')

		// Footer should be visible
		const footer = page.locator('footer')
		await expect(footer).toBeVisible()

		// All legal links should be present
		await expect(footer.getByRole('link', { name: /privacy/i })).toBeVisible()
		await expect(footer.getByRole('link', { name: /legal/i })).toBeVisible()
		await expect(footer.getByRole('link', { name: /cgv/i })).toBeVisible()
		await expect(footer.getByRole('link', { name: /terms/i })).toBeVisible()
	})

	test('footer privacy link should navigate to /privacy', async ({ page }) => {
		await page.goto('/')
		const privacyLink = page.locator('footer').getByRole('link', { name: /privacy/i })
		await expect(privacyLink).toHaveAttribute('href', '/privacy')
		await privacyLink.click()
		await expect(page).toHaveURL(/\/privacy/)
	})

	test('footer legal link should navigate to /legal', async ({ page }) => {
		await page.goto('/')
		const legalLink = page.locator('footer').getByRole('link', { name: /^legal$/i })
		await expect(legalLink).toHaveAttribute('href', '/legal')
		await legalLink.click()
		await expect(page).toHaveURL(/\/legal/)
	})

	test('footer CGV link should navigate to /cgv', async ({ page }) => {
		await page.goto('/')
		const cgvLink = page.locator('footer').getByRole('link', { name: /^cgv$/i })
		await expect(cgvLink).toHaveAttribute('href', '/cgv')
		await cgvLink.click()
		await expect(page).toHaveURL(/\/cgv/)
	})

	test('footer terms link should navigate to /tos', async ({ page }) => {
		await page.goto('/')
		const tosLink = page.locator('footer').getByRole('link', { name: /^terms$/i })
		await expect(tosLink).toHaveAttribute('href', '/tos')
		await tosLink.click()
		await expect(page).toHaveURL(/\/tos/)
	})
})

test.describe('CGV Page', () => {
	test('should render the CGV page with all required sections', async ({ page }) => {
		await page.goto('/cgv')

		// Page title
		await expect(page.getByRole('heading', { name: /conditions générales de vente/i })).toBeVisible()

		// Required sections
		await expect(page.getByRole('heading', { name: /identité du vendeur/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /objet et champ d'application/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /^3\. Commande/ })).toBeVisible()
		await expect(page.getByRole('heading', { name: /prix et tva/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /^5\. Paiement/ })).toBeVisible()
		await expect(page.getByRole('heading', { name: /^6\. Livraison/ })).toBeVisible()
		await expect(page.getByRole('heading', { name: /droit de rétractation/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /retours et remboursement/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /garantie/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /réclamation et médiation/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /données personnelles/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /loi applicable/i })).toBeVisible()
	})

	test('should include model withdrawal form', async ({ page }) => {
		await page.goto('/cgv')

		// Model withdrawal form should be present
		await expect(
			page.getByRole('heading', { name: /modèle de formulaire de rétractation/i }),
		).toBeVisible()
	})

	test('should link to legal page and privacy page', async ({ page }) => {
		await page.goto('/cgv')

		// Link to Mentions Légales
		const legalLink = page.getByRole('link', { name: /mentions légales/i }).first()
		await expect(legalLink).toBeVisible()
		await expect(legalLink).toHaveAttribute('href', '/legal')

		// Link to Privacy
		const privacyLink = page.getByRole('link', { name: /politique de confidentialité/i })
		await expect(privacyLink).toBeVisible()
		await expect(privacyLink).toHaveAttribute('href', '/privacy')
	})
})

test.describe('Terms of Service Page', () => {
	test('should render the ToS page with required sections', async ({ page }) => {
		await page.goto('/tos')

		await expect(page.getByRole('heading', { name: /terms of service/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /account/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /intellectual property/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /acceptable use/i })).toBeVisible()
		await expect(page.getByRole('heading', { name: /contact/i })).toBeVisible()
	})

	test('should link to CGV page for sale terms', async ({ page }) => {
		await page.goto('/tos')

		const cgvLink = page.getByRole('link', { name: /conditions générales de vente/i })
		await expect(cgvLink).toBeVisible()
		await expect(cgvLink).toHaveAttribute('href', '/cgv')
	})
})

test.describe('CGV Consent on Checkout Review', () => {
	test.describe.configure({ mode: 'serial', timeout: 120_000 })

	const CATEGORY_PREFIX = 'cgv-e2e-category-'
	const PRODUCT_PREFIX = 'cgv-e2e-product-'
	const SKU_PREFIX = 'CGV-E2E-'

	async function createTestData() {
		const unique = randomUUID()
		const category = await prisma.category.create({
			data: {
				name: `Test Category ${unique.slice(-8)}`,
				slug: `${CATEGORY_PREFIX}${unique}`,
				description: 'Test category for CGV checkout',
			},
		})

		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: `${PRODUCT_PREFIX}${unique}`,
				description: productData.description,
				sku: `${SKU_PREFIX}${unique}`,
				price: 2999,
				status: 'ACTIVE',
				categoryId: category.id,
				stockQuantity: 10,
			},
		})

		return { category, product }
	}

	test('should show CGV checkbox on review page', async ({ page }) => {
		const { product } = await createTestData()

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		const addButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addButton).toBeVisible({ timeout: 10000 })
		await addButton.click()
		await expect(page).toHaveURL(/\/shop\/cart/, { timeout: 5000 })

		// Navigate to checkout review
		await page.goto('/shop/checkout/review')
		await page.waitForURL(/\/shop\/checkout\/review/, { timeout: 15000 })

		// CGV checkbox should be visible
		const cgvCheckbox = page.getByRole('checkbox', { name: /conditions générales de vente/i })
		await expect(cgvCheckbox).toBeVisible({ timeout: 10000 })
		await expect(cgvCheckbox).not.toBeChecked()

		// Link to CGV page should be present
		const cgvLink = page.getByRole('link', { name: /conditions générales de vente/i })
		await expect(cgvLink).toBeVisible()
		await expect(cgvLink).toHaveAttribute('href', '/cgv')
	})

	test('should show error when submitting without accepting CGV', async ({ page }) => {
		const { product } = await createTestData()

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		const addButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addButton).toBeVisible({ timeout: 10000 })
		await addButton.click()
		await expect(page).toHaveURL(/\/shop\/cart/, { timeout: 5000 })

		// Navigate to checkout review
		await page.goto('/shop/checkout/review')
		await page.waitForURL(/\/shop\/checkout\/review/, { timeout: 15000 })

		// Click "Continue to Shipping" without checking CGV
		await page.getByRole('button', { name: /continue to shipping/i }).click()

		// Should show error message
		await expect(page.getByText(/you must accept the cgv/i)).toBeVisible({ timeout: 5000 })

		// Should still be on the review page
		await expect(page).toHaveURL(/\/shop\/checkout\/review/)
	})

	test('should proceed to shipping when CGV is accepted', async ({ page }) => {
		const { product } = await createTestData()

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		const addButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addButton).toBeVisible({ timeout: 10000 })
		await addButton.click()
		await expect(page).toHaveURL(/\/shop\/cart/, { timeout: 5000 })

		// Navigate to checkout review
		await page.goto('/shop/checkout/review')
		await page.waitForURL(/\/shop\/checkout\/review/, { timeout: 15000 })

		// Check the CGV checkbox
		const cgvCheckbox = page.getByRole('checkbox', { name: /conditions générales de vente/i })
		await expect(cgvCheckbox).toBeVisible({ timeout: 10000 })
		await cgvCheckbox.check()
		await expect(cgvCheckbox).toBeChecked()

		// Click continue - should navigate to shipping
		await page.getByRole('button', { name: /continue to shipping/i }).click()

		// Should navigate to shipping page
		await expect(page).toHaveURL(/\/shop\/checkout\/shipping/, { timeout: 15000 })
	})

	test.afterEach(async () => {
		// Cleanup test data
		try {
			await prisma.orderItem.deleteMany({
				where: { product: { sku: { startsWith: SKU_PREFIX } } },
			})
		} catch { /* ignore */ }
		try {
			await prisma.cartItem.deleteMany({
				where: { product: { sku: { startsWith: SKU_PREFIX } } },
			})
		} catch { /* ignore */ }
		try {
			await prisma.product.deleteMany({
				where: { sku: { startsWith: SKU_PREFIX } },
			})
		} catch { /* ignore */ }
		try {
			await prisma.category.deleteMany({
				where: { slug: { startsWith: CATEGORY_PREFIX } },
			})
		} catch { /* ignore */ }
	})
})
