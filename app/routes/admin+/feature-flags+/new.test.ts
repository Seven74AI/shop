/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { action, loader } from './new.tsx'

async function createAuthenticatedRequest(url: string, userId: string, method = 'GET'): Promise<Request> {
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
		headers: {
			Cookie: cookie,
		},
	})
}

describe('admin feature flags new route', () => {
	let adminUserId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.flag.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns empty data', async () => {
		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/feature-flags/new',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		expect(result).toEqual({})
	})

	test('action creates a new feature flag', async () => {
		const formData = new FormData()
		formData.append('key', 'my_test_flag')
		formData.append('enabled', 'true')
		formData.append('rolloutPercentage', '50')
		formData.append('description', 'A test flag for unit testing')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/feature-flags/new',
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
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		// Should redirect
		expect(result).toHaveProperty('headers')
		if (!('headers' in result)) {
			throw new Error('Expected result to have headers')
		}
		expect(result.headers.get('location')).toContain('/admin/feature-flags')

		// Verify flag was created
		const flag = await prisma.flag.findUnique({
			where: { key: 'my_test_flag' },
		})
		expect(flag).toBeTruthy()
		expect(flag?.enabled).toBe(true)
		expect(flag?.rolloutPercentage).toBe(50)
		expect(flag?.description).toBe('A test flag for unit testing')
	})

	test('action validates key format', async () => {
		const formData = new FormData()
		formData.append('key', 'bad key!')
		formData.append('enabled', 'false')
		formData.append('rolloutPercentage', '0')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/feature-flags/new',
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
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		expect(result).toHaveProperty('result')
		if (!('result' in result)) {
			throw new Error('Expected result to have result property')
		}
		expect(result.result?.status).toBe('error')
	})

	test('action rejects duplicate key', async () => {
		// Create a flag first
		await prisma.flag.create({
			data: {
				key: 'existing_flag',
				enabled: false,
				rolloutPercentage: 0,
			},
		})

		const formData = new FormData()
		formData.append('key', 'existing_flag')
		formData.append('enabled', 'true')
		formData.append('rolloutPercentage', '100')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/feature-flags/new',
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
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		expect(result).toHaveProperty('result')
		if (!('result' in result)) {
			throw new Error('Expected result to have result property')
		}
		expect(result.result?.status).toBe('error')
		// Should have error on key field
	})

	test('action creates flag with audience JSON', async () => {
		const formData = new FormData()
		formData.append('key', 'audience_flag')
		formData.append('enabled', 'true')
		formData.append('rolloutPercentage', '0')
		formData.append('audience', JSON.stringify({ countries: ['FR', 'BE'], roles: ['beta'] }))

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/feature-flags/new',
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
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		const flag = await prisma.flag.findUnique({
			where: { key: 'audience_flag' },
		})
		expect(flag).toBeTruthy()
		expect(flag?.audience).toBe(
			JSON.stringify({ countries: ['FR', 'BE'], roles: ['beta'] }),
		)
	})
})
