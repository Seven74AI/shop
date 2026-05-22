/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { action } from './$promotionId.delete.ts'

async function createAuthenticatedRequest(
	userId: string,
	params: Record<string, string>,
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

	return new Request('http://localhost:3000/admin/promotions/delete', {
		method: 'POST',
		headers: { Cookie: cookie },
	})
}

describe('admin promotions delete route', () => {
	let adminUserId: string
	let promotionId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id

		const promotion = await prisma.promotion.create({
			data: {
				name: 'To Delete',
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				isActive: true,
			},
		})
		promotionId = promotion.id
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.promotion.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('action deletes promotion', async () => {
		const formData = new FormData()
		formData.append('promotionId', promotionId)

		const request = await createAuthenticatedRequest(adminUserId, {})
		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		const result = await action({
			request: requestWithFormData,
			params: { promotionId },
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		expect(result).toHaveProperty('headers')
		if (!('headers' in result)) {
			throw new Error('Expected result to have headers')
		}

		const deleted = await prisma.promotion.findUnique({
			where: { id: promotionId },
		})
		expect(deleted).toBeNull()
	})

	test('action returns 404 for non-existent promotion', async () => {
		const formData = new FormData()
		formData.append('promotionId', 'nonexistent')

		const request = await createAuthenticatedRequest(adminUserId, {})
		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		await expect(
			action({
				request: requestWithFormData,
				params: { promotionId: 'nonexistent' },
				context: {},
				url: new URL('http://localhost'),
				pattern: '',
			}),
		).rejects.toThrow()
	})
})
