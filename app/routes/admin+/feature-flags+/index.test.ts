/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { loader } from './index.tsx'

// Helper to create an authenticated request
async function createAuthenticatedRequest(url: string, userId: string): Promise<Request> {
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
		method: 'GET',
		headers: {
			Cookie: cookie,
		},
	})
}

describe('admin feature flags index route', () => {
	let adminUserId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id

		// Create some sample flags
		await prisma.flag.createMany({
			data: [
				{
					key: 'experimental_feature',
					enabled: true,
					rolloutPercentage: 10,
					description: 'Experimental feature for testing',
				},
				{
					key: 'new_checkout_flow',
					enabled: false,
					rolloutPercentage: 0,
					description: 'New checkout flow redesign',
				},
				{
					key: 'dark_mode',
					enabled: true,
					rolloutPercentage: 100,
					audience: JSON.stringify({ roles: ['admin'] }),
					description: 'Dark mode for all users',
				},
			],
		})
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.flag.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns all flags ordered by key', async () => {
		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/feature-flags',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		expect(result).toHaveProperty('flags')
		expect(result.flags).toHaveLength(3)
		// Should be sorted by key alphabetically
		expect(result.flags[0].key).toBe('dark_mode')
		expect(result.flags[1].key).toBe('experimental_feature')
		expect(result.flags[2].key).toBe('new_checkout_flow')
	})
})
