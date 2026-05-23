/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './index.tsx'

describe('admin audit list', () => {
	let adminUserId: string
	let regularUserId: string

	beforeEach(async () => {
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		const adminUser = await prisma.user.create({
			data: {
				email: `admin-audit-${Date.now()}@example.com`,
				username: `admin-audit-${Date.now()}`,
				roles: { connect: { id: adminRole.id } },
			},
		})
		adminUserId = adminUser.id

		const regularUser = await prisma.user.create({
			data: {
				email: `regular-audit-${Date.now()}@example.com`,
				username: `regular-audit-${Date.now()}`,
			},
		})
		regularUserId = regularUser.id
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

	test('returns empty list when no audit entries exist', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit',
		)

		const result = await loader({ request } as any)
		expect(result.auditLogs).toEqual([])
		expect(result.total).toBe(0)
		expect(result.totalPages).toBe(0)
		expect(result.page).toBe(1)
	})

	test('returns audit entries sorted by newest first', async () => {
		// Create two audit entries with a delay to ensure ordering
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'CREATE',
				entityType: 'Product',
				entityId: 'prod-1',
				createdAt: new Date('2025-01-01T10:00:00Z'),
			},
		})
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'UPDATE',
				entityType: 'Product',
				entityId: 'prod-2',
				createdAt: new Date('2025-01-02T10:00:00Z'),
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit',
		)

		const result = await loader({ request } as any)
		expect(result.auditLogs).toHaveLength(2)
		// Most recent first
		expect(result.auditLogs[0]!.action).toBe('UPDATE')
		expect(result.auditLogs[1]!.action).toBe('CREATE')
		expect(result.total).toBe(2)
	})

	test('filters by action type', async () => {
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'CREATE',
				entityType: 'Product',
				entityId: 'prod-1',
			},
		})
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'DELETE',
				entityType: 'Category',
				entityId: 'cat-1',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit?action=CREATE',
		)

		const result = await loader({ request } as any)
		expect(result.auditLogs).toHaveLength(1)
		expect(result.auditLogs[0]!.action).toBe('CREATE')
		expect(result.total).toBe(1)
	})

	test('filters by entity type', async () => {
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'UPDATE',
				entityType: 'Product',
				entityId: 'prod-1',
			},
		})
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'UPDATE',
				entityType: 'Order',
				entityId: 'ord-1',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit?entityType=Product',
		)

		const result = await loader({ request } as any)
		expect(result.auditLogs).toHaveLength(1)
		expect(result.auditLogs[0]!.entityType).toBe('Product')
	})

	test('filters by date range', async () => {
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'CREATE',
				entityType: 'Product',
				entityId: 'prod-1',
				createdAt: new Date('2025-01-01T10:00:00Z'),
			},
		})
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'UPDATE',
				entityType: 'Product',
				entityId: 'prod-2',
				createdAt: new Date('2025-06-15T10:00:00Z'),
			},
		})
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'DELETE',
				entityType: 'Category',
				entityId: 'cat-1',
				createdAt: new Date('2025-12-31T10:00:00Z'),
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit?from=2025-01-01&to=2025-06-30',
		)

		const result = await loader({ request } as any)
		expect(result.auditLogs).toHaveLength(2)
		// Only Jan 1 and Jun 15 should appear (Dec 31 is outside range)
		const actions = result.auditLogs.map((e: any) => e.action)
		expect(actions).toContain('CREATE')
		expect(actions).toContain('UPDATE')
		expect(actions).not.toContain('DELETE')
	})

	test('paginates results', async () => {
		// Create 5 audit entries
		for (let i = 0; i < 5; i++) {
			await prisma.auditLog.create({
				data: {
					userId: adminUserId,
					action: 'CREATE',
					entityType: 'Product',
					entityId: `prod-${i}`,
				},
			})
		}

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit?perPage=3&page=1',
		)

		const result = await loader({ request } as any)
		expect(result.auditLogs).toHaveLength(3)
		expect(result.total).toBe(5)
		expect(result.totalPages).toBe(2)
		expect(result.page).toBe(1)
	})

	test('page 2 returns correct slice', async () => {
		for (let i = 0; i < 5; i++) {
			await prisma.auditLog.create({
				data: {
					userId: adminUserId,
					action: 'CREATE',
					entityType: 'Product',
					entityId: `prod-${i}`,
				},
			})
		}

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit?perPage=3&page=2',
		)

		const result = await loader({ request } as any)
		expect(result.auditLogs).toHaveLength(2)
		expect(result.page).toBe(2)
	})

	test('blocks non-admin users', async () => {
		const request = await createAuthRequest(
			regularUserId,
			'https://example.com/admin/audit',
		)

		await expect(loader({ request } as any)).rejects.toThrow()
	})

	test('returns entity types for filter dropdown', async () => {
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'CREATE',
				entityType: 'Product',
				entityId: 'prod-1',
			},
		})
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'UPDATE',
				entityType: 'Order',
				entityId: 'ord-1',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit',
		)

		const result = await loader({ request } as any)
		expect(result.entityTypes).toContain('Product')
		expect(result.entityTypes).toContain('Order')
		expect(result.entityTypes).toHaveLength(2)
	})

	test('includes user data in audit entries', async () => {
		await prisma.auditLog.create({
			data: {
				userId: adminUserId,
				action: 'CREATE',
				entityType: 'Product',
				entityId: 'prod-1',
			},
		})

		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit',
		)

		const result = await loader({ request } as any)
		expect(result.auditLogs).toHaveLength(1)
		expect(result.auditLogs[0]!.user).toBeTruthy()
		expect(result.auditLogs[0]!.user!.id).toBe(adminUserId)
	})

	test('handles invalid params gracefully', async () => {
		const request = await createAuthRequest(
			adminUserId,
			'https://example.com/admin/audit?page=invalid&action=INVALID_ACTION',
		)

		// Should not throw — falls back to defaults
		const result = await loader({ request } as any)
		expect(result.page).toBe(1) // falls back to default
		expect(result.auditLogs).toBeDefined()
	})
})
