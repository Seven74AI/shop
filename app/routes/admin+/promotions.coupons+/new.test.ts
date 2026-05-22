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

describe('admin coupons new route', () => {
	let adminUserId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.coupon.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns empty data', async () => {
		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/coupons/new',
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

	test('action creates a new percentage coupon', async () => {
		const formData = new FormData()
		formData.append('code', 'SUMMER25')
		formData.append('discountType', 'PERCENTAGE')
		formData.append('discountValue', '2500')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/coupons/new',
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
		expect(result.headers.get('location')).toContain('/admin/promotions/coupons')

		const coupon = await prisma.coupon.findUnique({
			where: { code: 'SUMMER25' },
		})
		expect(coupon).toBeTruthy()
		expect(coupon?.discountType).toBe('PERCENTAGE')
		expect(coupon?.discountValue).toBe(2500)
		expect(coupon?.isActive).toBe(true)
	})

	test('action creates a fixed-amount coupon', async () => {
		const formData = new FormData()
		formData.append('code', 'FLAT10')
		formData.append('discountType', 'FIXED_AMOUNT')
		formData.append('discountValue', '1000')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/coupons/new',
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

		const coupon = await prisma.coupon.findUnique({
			where: { code: 'FLAT10' },
		})
		expect(coupon).toBeTruthy()
		expect(coupon?.discountType).toBe('FIXED_AMOUNT')
		expect(coupon?.discountValue).toBe(1000)
	})

	test('action creates coupon with min order amount and max uses', async () => {
		const formData = new FormData()
		formData.append('code', 'BIGSPEND')
		formData.append('discountType', 'PERCENTAGE')
		formData.append('discountValue', '1000')
		formData.append('minOrderAmount', '5000')
		formData.append('maxUses', '100')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/coupons/new',
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

		const coupon = await prisma.coupon.findUnique({
			where: { code: 'BIGSPEND' },
		})
		expect(coupon).toBeTruthy()
		expect(coupon?.minOrderAmount).toBe(5000)
		expect(coupon?.maxUses).toBe(100)
	})

	test('action rejects duplicate coupon code', async () => {
		await prisma.coupon.create({
			data: {
				code: 'EXISTING',
				discountType: 'PERCENTAGE',
				discountValue: 1000,
				isActive: true,
			},
		})

		const formData = new FormData()
		formData.append('code', 'EXISTING')
		formData.append('discountType', 'PERCENTAGE')
		formData.append('discountValue', '2000')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/coupons/new',
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

	test('action validates code format', async () => {
		const formData = new FormData()
		formData.append('code', 'bad code!')
		formData.append('discountType', 'PERCENTAGE')
		formData.append('discountValue', '1000')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/coupons/new',
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

	test('action creates inactive coupon', async () => {
		const formData = new FormData()
		formData.append('code', 'DRAFTCOUPON')
		formData.append('discountType', 'PERCENTAGE')
		formData.append('discountValue', '500')
		// isActive not checked → defaults to false

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/promotions/coupons/new',
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

		const coupon = await prisma.coupon.findUnique({
			where: { code: 'DRAFTCOUPON' },
		})
		expect(coupon).toBeTruthy()
		expect(coupon?.isActive).toBe(false)
	})
})
