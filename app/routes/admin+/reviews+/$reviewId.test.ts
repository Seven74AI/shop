/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader, action } from './$reviewId.tsx'

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

describe('admin review detail', () => {
	let adminUserId: string
	let productId: string
	let userId: string
	let reviewId: string
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
				name: 'Detail Test Category',
				slug: `detail-test-category-${Date.now()}`,
				description: 'Test category for detail review tests',
			},
		})
		categoryId = category.id

		const admin = await prisma.user.create({
			data: {
				email: `admin-detail-${Date.now()}@example.com`,
				username: `admin-detail-${Date.now()}`,
				roles: { connect: { id: adminRole.id } },
			},
		})
		adminUserId = admin.id

		const user = await prisma.user.create({
			data: {
				email: `reviewer-detail-${Date.now()}@example.com`,
				username: `reviewer-detail-${Date.now()}`,
			},
		})
		userId = user.id

		const product = await prisma.product.create({
			data: {
				name: `Detail Product ${Date.now()}`,
				sku: `SKU-DETAIL-${Date.now()}`,
				slug: `detail-product-${Date.now()}`,
				price: 2999,
				status: 'ACTIVE',
				categoryId,
			},
		})
		productId = product.id

		const review = await prisma.review.create({
			data: {
				productId,
				userId,
				rating: 4,
				title: 'Good product',
				body: 'Really enjoyed using it.',
			},
		})
		reviewId = review.id
	})

	afterEach(async () => {
		await prisma.review.deleteMany({})
		await prisma.session.deleteMany({})
		await prisma.product.deleteMany({})
		await prisma.category.deleteMany({})
		await prisma.user.deleteMany({})
	})

	describe('loader', () => {
		test('returns review with product, user, and order data', async () => {
			const request = await createAuthRequest(
				adminUserId,
				`https://example.com/admin/reviews/${reviewId}`,
			)

			const result = await loader({
				request,
				params: { reviewId },
				context: {},
			} as any)

			expect(result.review).toBeTruthy()
			expect(result.review.id).toBe(reviewId)
			expect(result.review.title).toBe('Good product')
			expect(result.review.rating).toBe(4)
			expect(result.review.product).toBeTruthy()
			expect(result.review.product.name).toBeTruthy()
			expect(result.review.user).toBeTruthy()
			expect(result.review.user.username).toBeTruthy()
		})

		test('returns 404 for non-existent review', async () => {
			const request = await createAuthRequest(
				adminUserId,
				'https://example.com/admin/reviews/non-existent-id',
			)

			await expect(
				loader({
					request,
					params: { reviewId: 'non-existent-id' },
					context: {},
				} as any),
			).rejects.toThrow()
		})
	})

	describe('action', () => {
		test('approves a single review', async () => {
			const formData = new FormData()
			formData.set('intent', 'approve')

			const request = await createAuthRequest(
				adminUserId,
				`https://example.com/admin/reviews/${reviewId}`,
				'POST',
				formData,
			)

			await action({
				request,
				params: { reviewId },
				context: {},
			} as any)

			const updated = await prisma.review.findUnique({ where: { id: reviewId } })
			expect(updated!.isApproved).toBe(true)
			expect(updated!.rejectionReason).toBeNull()
		})

		test('rejects a single review with reason', async () => {
			const formData = new FormData()
			formData.set('intent', 'reject')
			formData.set('rejectionReason', 'Offensive language')

			const request = await createAuthRequest(
				adminUserId,
				`https://example.com/admin/reviews/${reviewId}`,
				'POST',
				formData,
			)

			await action({
				request,
				params: { reviewId },
				context: {},
			} as any)

			const updated = await prisma.review.findUnique({ where: { id: reviewId } })
			expect(updated!.isApproved).toBe(false)
			expect(updated!.rejectionReason).toBe('Offensive language')
		})

		test('rejects with default reason when none provided', async () => {
			const formData = new FormData()
			formData.set('intent', 'reject')

			const request = await createAuthRequest(
				adminUserId,
				`https://example.com/admin/reviews/${reviewId}`,
				'POST',
				formData,
			)

			await action({
				request,
				params: { reviewId },
				context: {},
			} as any)

			const updated = await prisma.review.findUnique({ where: { id: reviewId } })
			expect(updated!.rejectionReason).toBe('Rejected by admin')
		})
	})
})
