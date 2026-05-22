/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './$auditLogId.tsx'

describe('admin audit detail', () => {
	let adminUserId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const user = await prisma.user.create({
			data: {
				email: `admin-detail-${Date.now()}@example.com`,
				username: `admin-detail-${Date.now()}`,
				roles: { connect: { id: adminRole.id } },
			},
		})
		adminUserId = user.id
	})

	afterEach(async () => {
		await prisma.auditLog.deleteMany({})
		await prisma.session.deleteMany({})
		await prisma.user.deleteMany({})
	})

	async function createAuthRequest(userId: string, url: string): Promise<Request> {
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
			method: 'GET',
			headers: { Cookie: cookieHeader },
		})
	}

	test('returns audit entry by ID', async () => {
		const entry = await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'UPDATE',
				entityType: 'Product',
				entityId: 'prod-1',
				changes: { name: { before: 'Old', after: 'New' } },
				ipAddress: '192.168.1.1',
				userAgent: 'TestAgent/1.0',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit/any',
		)

		const result = await loader({
			request,
			params: { auditLogId: entry.id },
		} as any)

		expect(result.entry).toBeTruthy()
		expect(result.entry.id).toBe(entry.id)
		expect(result.entry.action).toBe('UPDATE')
		expect(result.entry.entityType).toBe('Product')
		expect(result.entry.entityId).toBe('prod-1')
	})

	test('includes user data in entry', async () => {
		const entry = await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'CREATE',
				entityType: 'Order',
				entityId: 'ord-1',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit/any',
		)

		const result = await loader({
			request,
			params: { auditLogId: entry.id },
		} as any)

		expect(result.entry.user).toBeTruthy()
		expect(result.entry.user!.id).toBe(adminUserId)
	})

	test('returns 404 for non-existent entry', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit/any',
		)

		await expect(
			loader({
				request,
				params: { auditLogId: 'nonexistent-id' },
			} as any),
		).rejects.toThrow()
	})

	test('blocks non-admin users', async () => {
		const regularUser = await prisma.user.create({
			data: {
				email: `regular-detail-${Date.now()}@example.com`,
				username: `regular-detail-${Date.now()}`,
			},
		})

		const entry = await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'CREATE',
				entityType: 'Product',
				entityId: 'prod-1',
			},
		})

		const request = await createAuthRequest(
			regularUser.id,
			'https://example.com/admin/audit/any',
		)

		await expect(
			loader({
				request,
				params: { auditLogId: entry.id },
			} as any),
		).rejects.toThrow()
	})

	test('renders audit entry with null userId as system', async () => {
		const entry = await prisma.auditLog.create({
			data: {
				userId: null,
				action: 'LOGIN',
				entityType: 'Session',
				entityId: 'session-1',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit/any',
		)

		const result = await loader({
			request,
			params: { auditLogId: entry.id },
		} as any)

		expect(result.entry.user).toBeNull()
		expect(result.entry.userId).toBeNull()
		expect(result.entry.action).toBe('LOGIN')
	})

	test('includes JSON changes in entry', async () => {
		const changes = {
			status: { before: 'PENDING', after: 'CONFIRMED' },
			total: { before: 10000, after: 12000 },
		}

		const entry = await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'UPDATE',
				entityType: 'Order',
				entityId: 'ord-1',
				changes,
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit/any',
		)

		const result = await loader({
			request,
			params: { auditLogId: entry.id },
		} as any)

		expect(result.entry.changes).toEqual(changes)
	})
})
