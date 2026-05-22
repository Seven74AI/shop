/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { action, loader } from './new.tsx'

async function createAuthenticatedRequest(
	url: string,
	userId: string,
	method = 'GET',
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

	return new Request(url, {
		method,
		headers: { Cookie: cookie },
	})
}

describe('admin promotions new route', () => {
	let adminUserId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.promotion.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns empty data', async () => {
		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/new',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		expect(result).toEqual({})
	})

	test('action creates a new promotion', async () => {
		const formData = new FormData()
		formData.append('name', 'Summer Sale 2025')
		formData.append('description', 'Big summer discounts')
		formData.append('discountType', 'PERCENTAGE')
		formData.append('discountValue', '1500')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/new',
			adminUserId,
			'POST',
		)

		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		const result = await action({
			request: requestWithFormData,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		expect(result).toHaveProperty('headers')
		if (!('headers' in result)) {
			throw new Error('Expected result to have headers')
		}
		expect(result.headers.get('location')).toContain('/admin/promotions')

		const promotion = await prisma.promotion.findFirst({
			where: { name: 'Summer Sale 2025' },
		})
		expect(promotion).toBeTruthy()
		expect(promotion?.discountType).toBe('PERCENTAGE')
		expect(promotion?.discountValue).toBe(1500)
		expect(promotion?.isActive).toBe(true)
	})

	test('action creates a fixed-amount promotion', async () => {
		const formData = new FormData()
		formData.append('name', '5 EUR Off')
		formData.append('discountType', 'FIXED_AMOUNT')
		formData.append('discountValue', '500')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/new',
			adminUserId,
			'POST',
		)

		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		await action({
			request: requestWithFormData,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		const promotion = await prisma.promotion.findFirst({
			where: { name: '5 EUR Off' },
		})
		expect(promotion).toBeTruthy()
		expect(promotion?.discountType).toBe('FIXED_AMOUNT')
		expect(promotion?.discountValue).toBe(500)
	})

	test('action validates required name', async () => {
		const formData = new FormData()
		formData.append('name', '')
		formData.append('discountType', 'PERCENTAGE')
		formData.append('discountValue', '1000')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/new',
			adminUserId,
			'POST',
		)

		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		const result = await action({
			request: requestWithFormData,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		expect(result).toHaveProperty('result')
		if (!('result' in result)) {
			throw new Error('Expected result to have result property')
		}
		expect(result.result?.status).toBe('error')
	})

	test('action creates inactive promotion', async () => {
		const formData = new FormData()
		formData.append('name', 'Draft Promotion')
		formData.append('discountType', 'PERCENTAGE')
		formData.append('discountValue', '500')
		// isActive not set → defaults to false (checkbox unchecked)

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/new',
			adminUserId,
			'POST',
		)

		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		await action({
			request: requestWithFormData,
			params: {},
			context: {},
			url: new URL('http://localhost'),
			pattern: '',
		})

		const promotion = await prisma.promotion.findFirst({
			where: { name: 'Draft Promotion' },
		})
		expect(promotion).toBeTruthy()
		expect(promotion?.isActive).toBe(false)
	})
})
