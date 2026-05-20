/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { loader } from './$logId.tsx'

// Helper to create an authenticated request
async function createAuthenticatedRequest(
	url: string,
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

	return new Request(url, {
		headers: {
			Cookie: cookie,
		},
	})
}

describe('admin audit log detail route', () => {
	let adminUserId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id

		await prisma.auditLog.deleteMany()
	})

	afterEach(async () => {
		await prisma.auditLog.deleteMany()
		await prisma.session.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns a single audit log by ID', async () => {
		const log = await prisma.auditLog.create({
			data: {
				action: 'product.updated',
				entityType: 'Product',
				entityId: 'product-42',
				actorUserId: adminUserId,
				actorEmail: 'admin@example.com',
				before: { name: 'Old Name', price: 1000 },
				after: { name: 'New Name', price: 1200 },
				requestId: 'req-detail-1',
			},
		})

		const request = await createAuthenticatedRequest(
			`http://localhost:3000/admin/audit-log/${log.id}`,
			adminUserId,
		)

		const result = await loader({
			request,
			params: { logId: log.id },
			context: {},
		})

		expect(result).toHaveProperty('auditLog')
		expect(result.auditLog.id).toBe(log.id)
		expect(result.auditLog.action).toBe('product.updated')
		expect(result.auditLog.entityType).toBe('Product')
		expect(result.auditLog.entityId).toBe('product-42')
		expect(result.auditLog.actorUserId).toBe(adminUserId)
		expect(result.auditLog.actorEmail).toBe('admin@example.com')
		expect(result.auditLog.before).toEqual({ name: 'Old Name', price: 1000 })
		expect(result.auditLog.after).toEqual({ name: 'New Name', price: 1200 })
		expect(result.auditLog.requestId).toBe('req-detail-1')
	})

	test('loader throws 404 for non-existent audit log ID', async () => {
		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/audit-log/nonexistent-id',
			adminUserId,
		)

		await expect(
			loader({
				request,
				params: { logId: 'nonexistent-id' },
				context: {},
			}),
		).rejects.toThrow()
	})

	test('loader returns audit log with null before/after', async () => {
		const log = await prisma.auditLog.create({
			data: {
				action: 'product.deleted',
				entityType: 'Product',
				entityId: 'product-99',
				actorUserId: adminUserId,
				before: null,
				after: null,
			},
		})

		const request = await createAuthenticatedRequest(
			`http://localhost:3000/admin/audit-log/${log.id}`,
			adminUserId,
		)

		const result = await loader({
			request,
			params: { logId: log.id },
			context: {},
		})

		expect(result.auditLog.before).toBeNull()
		expect(result.auditLog.after).toBeNull()
	})

	test('loader returns system action log (null actor)', async () => {
		const log = await prisma.auditLog.create({
			data: {
				action: 'system.cleanup',
				entityType: 'System',
				entityId: 'system-1',
				actorUserId: null,
				actorEmail: null,
			},
		})

		const request = await createAuthenticatedRequest(
			`http://localhost:3000/admin/audit-log/${log.id}`,
			adminUserId,
		)

		const result = await loader({
			request,
			params: { logId: log.id },
			context: {},
		})

		expect(result.auditLog.actorUserId).toBeNull()
		expect(result.auditLog.actorEmail).toBeNull()
	})

	test('loader rejects non-admin users', async () => {
		const user = await prisma.user.create({
			data: {
				username: 'regular-user-2',
				email: 'regular2@example.com',
				name: 'Regular User 2',
				password: {
					create: { hash: 'mock-hash-2' },
				},
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/audit-log/some-id',
			user.id,
		)

		await expect(
			loader({
				request,
				params: { logId: 'some-id' },
				context: {},
			}),
		).rejects.toThrow()
	})
})
