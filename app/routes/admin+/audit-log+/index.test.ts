/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { loader } from './index.tsx'

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

describe('admin audit log index route', () => {
	let adminUserId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id

		// Clean up any leftover audit logs
		await prisma.auditLog.deleteMany()
	})

	afterEach(async () => {
		await prisma.auditLog.deleteMany()
		await prisma.session.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns empty audit logs array when no entries exist', async () => {
		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/audit-log',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('auditLogs')
		expect(result.auditLogs).toHaveLength(0)
	})

	test('loader returns audit logs ordered by createdAt desc', async () => {
		// Create audit log entries with different timestamps
		const log1 = await prisma.auditLog.create({
			data: {
				action: 'product.created',
				entityType: 'Product',
				entityId: 'product-1',
				actorUserId: adminUserId,
				actorEmail: 'admin@example.com',
				createdAt: new Date('2025-01-01T00:00:00Z'),
			},
		})

		const log2 = await prisma.auditLog.create({
			data: {
				action: 'order.statusUpdated',
				entityType: 'Order',
				entityId: 'order-1',
				actorUserId: adminUserId,
				createdAt: new Date('2025-01-02T00:00:00Z'),
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/audit-log',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result.auditLogs).toHaveLength(2)
		// Most recent first
		expect(result.auditLogs[0]?.id).toBe(log2.id)
		expect(result.auditLogs[0]?.action).toBe('order.statusUpdated')
		expect(result.auditLogs[1]?.id).toBe(log1.id)
		expect(result.auditLogs[1]?.action).toBe('product.created')
	})

	test('loader returns audit logs with all expected fields', async () => {
		await prisma.auditLog.create({
			data: {
				action: 'user.roleChanged',
				entityType: 'User',
				entityId: 'user-123',
				actorUserId: adminUserId,
				actorEmail: 'admin@example.com',
				before: { role: 'customer' },
				after: { role: 'admin' },
				requestId: 'req-abc-123',
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/audit-log',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result.auditLogs).toHaveLength(1)
		const log = result.auditLogs[0]!
		expect(log).toHaveProperty('id')
		expect(log.action).toBe('user.roleChanged')
		expect(log.entityType).toBe('User')
		expect(log.entityId).toBe('user-123')
		expect(log.actorUserId).toBe(adminUserId)
		expect(log.actorEmail).toBe('admin@example.com')
		expect(log.before).toEqual({ role: 'customer' })
		expect(log.after).toEqual({ role: 'admin' })
		expect(log.requestId).toBe('req-abc-123')
		expect(log.createdAt).toBeInstanceOf(Date)
	})

	test('loader returns audit logs for different entity types', async () => {
		await prisma.auditLog.create({
			data: {
				action: 'product.created',
				entityType: 'Product',
				entityId: 'p-1',
				actorUserId: adminUserId,
			},
		})

		await prisma.auditLog.create({
			data: {
				action: 'order.statusUpdated',
				entityType: 'Order',
				entityId: 'o-1',
				actorUserId: adminUserId,
			},
		})

		await prisma.auditLog.create({
			data: {
				action: 'category.deleted',
				entityType: 'Category',
				entityId: 'c-1',
				actorUserId: adminUserId,
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/audit-log',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result.auditLogs).toHaveLength(3)
		const entityTypes = result.auditLogs.map((l) => l.entityType).sort()
		expect(entityTypes).toEqual(['Category', 'Order', 'Product'])
	})

	test('loader rejects non-admin users', async () => {
		// Create a non-admin user
		const user = await prisma.user.create({
			data: {
				username: 'regular-user',
				email: 'regular@example.com',
				name: 'Regular User',
				password: {
					create: { hash: 'mock-hash' },
				},
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/audit-log',
			user.id,
		)

		// Non-admin users should get a 403 error
		await expect(
			loader({ request, params: {}, context: {} }),
		).rejects.toThrow()
	})

	test('loader handles system actions (null actor)', async () => {
		await prisma.auditLog.create({
			data: {
				action: 'system.cleanup',
				entityType: 'System',
				entityId: 'system-1',
				actorUserId: null,
				actorEmail: null,
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/audit-log',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result.auditLogs).toHaveLength(1)
		expect(result.auditLogs[0]!.actorUserId).toBeNull()
		expect(result.auditLogs[0]!.actorEmail).toBeNull()
	})
})
