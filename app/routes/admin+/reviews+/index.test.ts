/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader, action } from './index.tsx'

async function createAuthRequest(
	userId: string,
	url: string,
	method: string = 'GET',
	body?: FormData,
): Promise<Request> {
	const session = await prisma.session.create({
		data: {
			userId,
			expirationDate: getSessionExpirationDate(),
		},
	})
	const authSession = await authSessionStorage.getSession()
	authSession.set(sessionKey, session.id)
	const cookieHeader = await authSessionStorage.commitSession(authSession)

	return new Request(url, {
		method,
		headers: { Cookie: cookieHeader },
		body: body ?? undefined,
	})
}

describe('admin reviews index', () => {
	let adminUserId: string
	let productId: string
	let userId: string
	let categoryId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		// Create a category first (required by Product schema)
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category for review tests',
			},
		})
		categoryId = category.id

		const admin = await prisma.user.create({
			data: {
				email: `admin-reviews-${Date.now()}@example.com`,
				username: `admin-reviews-${Date.now()}`,
				roles: { connect: { id: adminRole.id } },
			},
		})
		adminUserId = admin.id

		const user = await prisma.user.create({
			data: {
				email: `reviewer-${Date.now()}@example.com`,
				username: `reviewer-${Date.now()}`,
			},
		})
		userId = user.id

		const product = await prisma.product.create({
			data: {
				name: `Test Product ${Date.now()}`,
				sku: `SKU-${Date.now()}`,
				slug: `test-product-${Date.now()}`,
				price: 1999,
				status: 'ACTIVE',
				categoryId,
			},
		})
		productId = product.id
	})

	afterEach(async () => {
		await prisma.review.deleteMany({})
		await prisma.session.deleteMany({})
		await prisma.product.deleteMany({})
		await prisma.category.deleteMany({})
		await prisma.user.deleteMany({})
	})

	describe('loader', () => {
		test('returns empty list when no reviews exist', async () => {
			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews',
			)

			const result = await loader({ request, params: {}, context: {} } as any)
			expect(result).toHaveProperty('reviews')
			expect(result.reviews).toEqual([])
			expect(result).toHaveProperty('products')
			expect(result).toHaveProperty('activeStatus', 'all')
		})

		test('returns reviews with product and user data', async () => {
			const review = await prisma.review.create({
				data: {
					productId,
					userId,
					rating: 4,
					title: 'Great product',
					body: 'Loved it',
				},
			})

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews',
			)

			const result = await loader({ request, params: {}, context: {} } as any)
			expect(result.reviews).toHaveLength(1)
			expect(result.reviews[0]!.id).toBe(review.id)
			expect(result.reviews[0]!.product).toBeTruthy()
			expect(result.reviews[0]!.product!.name).toBeTruthy()
			expect(result.reviews[0]!.user).toBeTruthy()
			expect(result.reviews[0]!.user!.username).toBeTruthy()
		})

		test('filters by pending status', async () => {
			await prisma.review.createMany({
				data: [
					{ productId, userId, rating: 5, title: 'Approved', isApproved: true },
					{ productId, userId, rating: 1, title: 'Pending', isApproved: false },
					{ productId, userId, rating: 3, title: 'Rejected', rejectionReason: 'Spam' },
				],
			})

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews?status=pending',
			)

			const result = await loader({ request, params: {}, context: {} } as any)
			expect(result.reviews).toHaveLength(1)
			expect(result.reviews[0]!.title).toBe('Pending')
		})

		test('filters by approved status', async () => {
			await prisma.review.createMany({
				data: [
					{ productId, userId, rating: 5, title: 'Approved', isApproved: true },
					{ productId, userId, rating: 1, title: 'Pending', isApproved: false },
				],
			})

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews?status=approved',
			)

			const result = await loader({ request, params: {}, context: {} } as any)
			expect(result.reviews).toHaveLength(1)
			expect(result.reviews[0]!.title).toBe('Approved')
		})

		test('filters by rejected status', async () => {
			await prisma.review.createMany({
				data: [
					{ productId, userId, rating: 3, title: 'Rejected', rejectionReason: 'Spam' },
					{ productId, userId, rating: 4, title: 'Pending', isApproved: false },
				],
			})

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews?status=rejected',
			)

			const result = await loader({ request, params: {}, context: {} } as any)
			expect(result.reviews).toHaveLength(1)
			expect(result.reviews[0]!.title).toBe('Rejected')
		})

		test('filters by product', async () => {
			const otherProduct = await prisma.product.create({
				data: {
					name: 'Other Product',
					sku: `SKU-OTHER-${Date.now()}`,
					slug: `other-product-${Date.now()}`,
					price: 999,
					status: 'ACTIVE',
					categoryId,
				},
			})

			await prisma.review.create({
				data: { productId, userId, rating: 5, title: 'On Product 1' },
			})
			await prisma.review.create({
				data: { productId: otherProduct.id, userId, rating: 3, title: 'On Product 2' },
			})

			const request = await createAuthRequest(
				adminUserId,
				`https://example.com/admin/reviews?product=${otherProduct.id}`,
			)

			const result = await loader({ request, params: {}, context: {} } as any)
			expect(result.reviews).toHaveLength(1)
			expect(result.reviews[0]!.title).toBe('On Product 2')

			await prisma.review.deleteMany({})
			await prisma.product.delete({ where: { id: otherProduct.id } })
		})

		test('filters by rating', async () => {
			await prisma.review.createMany({
				data: [
					{ productId, userId, rating: 1, title: 'One star' },
					{ productId, userId, rating: 5, title: 'Five star' },
				],
			})

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews?rating=5',
			)

			const result = await loader({ request, params: {}, context: {} } as any)
			expect(result.reviews).toHaveLength(1)
			expect(result.reviews[0]!.title).toBe('Five star')
		})

		test('blocks non-admin users', async () => {
			const regularUser = await prisma.user.create({
				data: {
					email: `regular-reviews-${Date.now()}@example.com`,
					username: `regular-reviews-${Date.now()}`,
				},
			})

			const request = await createAuthRequest(
				regularUser.id,
				'https://example.com/admin/reviews',
			)

			await expect(
				loader({ request, params: {}, context: {} } as any),
			).rejects.toThrow()

			await prisma.user.delete({ where: { id: regularUser.id } })
		})
	})

	describe('action (bulk)', () => {
		test('bulk approves selected reviews', async () => {
			const r1 = await prisma.review.create({
				data: { productId, userId, rating: 5, title: 'R1' },
			})
			const r2 = await prisma.review.create({
				data: { productId, userId, rating: 4, title: 'R2' },
			})

			const formData = new FormData()
			formData.set('action', 'approve')
			formData.set('reviewIds', `${r1.id},${r2.id}`)

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews',
				'POST',
				formData,
			)

			const result = await action({ request, params: {}, context: {} } as any)

			// redirectWithToast returns a Response
			expect(result).toBeInstanceOf(Response)

			const updated1 = await prisma.review.findUnique({ where: { id: r1.id } })
			const updated2 = await prisma.review.findUnique({ where: { id: r2.id } })
			expect(updated1!.isApproved).toBe(true)
			expect(updated2!.isApproved).toBe(true)
		})

		test('bulk rejects selected reviews with reason', async () => {
			const r1 = await prisma.review.create({
				data: { productId, userId, rating: 1, title: 'R1' },
			})
			const r2 = await prisma.review.create({
				data: { productId, userId, rating: 2, title: 'R2' },
			})

			const formData = new FormData()
			formData.set('action', 'reject')
			formData.set('reviewIds', `${r1.id},${r2.id}`)
			formData.set('rejectionReason', 'Inappropriate content')

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews',
				'POST',
				formData,
			)

			await action({ request, params: {}, context: {} } as any)

			const updated1 = await prisma.review.findUnique({ where: { id: r1.id } })
			const updated2 = await prisma.review.findUnique({ where: { id: r2.id } })
			expect(updated1!.isApproved).toBe(false)
			expect(updated1!.rejectionReason).toBe('Inappropriate content')
			expect(updated2!.rejectionReason).toBe('Inappropriate content')
		})

		test('rejects with default reason if none provided', async () => {
			const r1 = await prisma.review.create({
				data: { productId, userId, rating: 1, title: 'R1' },
			})

			const formData = new FormData()
			formData.set('action', 'reject')
			formData.set('reviewIds', r1.id)

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews',
				'POST',
				formData,
			)

			await action({ request, params: {}, context: {} } as any)

			const updated = await prisma.review.findUnique({ where: { id: r1.id } })
			expect(updated!.rejectionReason).toBe('Rejected by admin')
		})

		test('returns error for invalid action', async () => {
			const formData = new FormData()
			formData.set('action', 'invalid')
			formData.set('reviewIds', 'some-id')

			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews',
				'POST',
				formData,
			)

			const result = await action({ request, params: {}, context: {} } as any)
			expect(result).toBeInstanceOf(Response)
			// Should be an error response
			if (result instanceof Response) {
				expect(result.status).toBeGreaterThanOrEqual(400)
			}
		})
	})
})
