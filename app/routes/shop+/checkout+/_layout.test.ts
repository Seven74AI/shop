/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { getOrCreateCart, addToCart } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { loader } from './_layout.tsx'

describe('Checkout Layout', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>
	let testUser: Awaited<ReturnType<typeof prisma.user.create>>

	beforeEach(async () => {
		testCategory = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: 'test-category',
				description: 'Test category description',
			},
		})

		testUser = await prisma.user.create({
			data: createUser(),
		})
	})

	afterEach(async () => {
		await prisma.cartItem.deleteMany({})
		await prisma.cart.deleteMany({})
		await prisma.productImage.deleteMany({})
		await prisma.productVariant.deleteMany({})
		await prisma.product.deleteMany({})
		await prisma.category.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('redirects to /shop/cart with toast when cart is empty (authenticated)', async () => {
		// Create empty cart
		await getOrCreateCart({ userId: testUser.id })

		// Create session
		const session = await prisma.session.create({
			data: {
				userId: testUser.id,
				expirationDate: getSessionExpirationDate(),
			},
		})

		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		const request = new Request('http://localhost:3000/shop/checkout/review', {
			headers: { Cookie: cookieHeader },
		})

		const result = await loader({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		// Should redirect
		expect(result).toBeInstanceOf(Response)
		if (result instanceof Response) {
			expect(result.status).toBe(302)
			expect(result.headers.get('location')).toBe('/shop/cart')
			// Verify toast cookie is set
			const setCookie = result.headers.get('set-cookie')
			expect(setCookie).toBeTruthy()
			expect(setCookie).toContain('en_toast')
			expect(setCookie).toContain('Your+cart+is+empty')
		}
	})

	test('redirects to /shop/cart with toast when no cart exists (no user, no session)', async () => {
		const request = new Request('http://localhost:3000/shop/checkout/review', {
			headers: {},
		})

		const result = await loader({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		// Should redirect
		expect(result).toBeInstanceOf(Response)
		if (result instanceof Response) {
			expect(result.status).toBe(302)
			expect(result.headers.get('location')).toBe('/shop/cart')
			// Verify toast cookie is set
			const setCookie = result.headers.get('set-cookie')
			expect(setCookie).toBeTruthy()
			expect(setCookie).toContain('en_toast')
		}
	})

	test('returns checkout step data when cart has items (authenticated)', async () => {
		// Create product
		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: 'test-product',
				description: 'Test description',
				price: 1000,
				sku: 'TEST-001',
				status: 'ACTIVE',
				categoryId: testCategory.id,
				stockQuantity: 10,
			},
		})

		// Create cart with item
		const cart = await getOrCreateCart({ userId: testUser.id })
		await addToCart(cart.id, product.id, null, 1)

		// Create session
		const session = await prisma.session.create({
			data: {
				userId: testUser.id,
				expirationDate: getSessionExpirationDate(),
			},
		})

		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		const request = new Request('http://localhost:3000/shop/checkout/review', {
			headers: { Cookie: cookieHeader },
		})

		const result = await loader({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		// Should return data, not redirect
		if (result instanceof Response) {
			throw new Error('Expected data object, got Response')
		}

		expect(result).toHaveProperty('currentStep')
		expect(result.currentStep).toBe('review')
	})

	test('returns correct step for shipping path', async () => {
		// Create product
		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: 'test-product',
				description: 'Test description',
				price: 1000,
				sku: 'TEST-002',
				status: 'ACTIVE',
				categoryId: testCategory.id,
				stockQuantity: 10,
			},
		})

		// Create cart with item
		const cart = await getOrCreateCart({ userId: testUser.id })
		await addToCart(cart.id, product.id, null, 1)

		// Create session
		const session = await prisma.session.create({
			data: {
				userId: testUser.id,
				expirationDate: getSessionExpirationDate(),
			},
		})

		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		const request = new Request('http://localhost:3000/shop/checkout/shipping', {
			headers: { Cookie: cookieHeader },
		})

		const result = await loader({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		if (result instanceof Response) {
			throw new Error('Expected data object, got Response')
		}

		expect(result.currentStep).toBe('shipping')
	})

	test('returns correct step for payment path', async () => {
		// Create product
		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: 'test-product',
				description: 'Test description',
				price: 1000,
				sku: 'TEST-003',
				status: 'ACTIVE',
				categoryId: testCategory.id,
				stockQuantity: 10,
			},
		})

		// Create cart with item
		const cart = await getOrCreateCart({ userId: testUser.id })
		await addToCart(cart.id, product.id, null, 1)

		// Create session
		const session = await prisma.session.create({
			data: {
				userId: testUser.id,
				expirationDate: getSessionExpirationDate(),
			},
		})

		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		const request = new Request('http://localhost:3000/shop/checkout/payment', {
			headers: { Cookie: cookieHeader },
		})

		const result = await loader({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		if (result instanceof Response) {
			throw new Error('Expected data object, got Response')
		}

		expect(result.currentStep).toBe('payment')
	})
})
