/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { action } from './$couponId.delete.ts'

async function createAuthenticatedRequest(
	userId: string,
): Promise<Request> {
	const session = await prisma.session.create({
		data: {
			userId,
			expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
		},
	})

	const authSession = await authSessionStorage.getSession()
	authSession.set('sessionId', session.id)
	const cookie = await authSessionStorage.commitSession(authSession)

	return new Request('http://localhost:3000/admin/promotions/coupons/delete', {
		method: 'POST',
		headers: { Cookie: cookie },
	})
}

describe('admin coupons delete route', () => {
	let adminUserId: string
	let couponId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id

		const coupon = await prisma.coupon.create({
			data: {
				code: 'TODELETE',
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				isActive: true,
			},
		})
		couponId = coupon.id
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.coupon.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('action deletes coupon', async () => {
		const formData = new FormData()
		formData.append('couponId', couponId)

		const request = await createAuthenticatedRequest(adminUserId)
		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		const result = await action({
			request: requestWithFormData,
			params: { couponId },
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		expect(result).toHaveProperty('headers')
		if (!('headers' in result)) {
			throw new Error('Expected result to have headers')
		}

		const deleted = await prisma.coupon.findUnique({
			where: { id: couponId },
		})
		expect(deleted).toBeNull()
	})
})
