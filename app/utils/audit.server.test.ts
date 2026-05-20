import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from './db.server.ts'
import { auditLog, withAudit } from './audit.server.ts'

// Mock Sentry
vi.mock('@sentry/react-router', () => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
}))

import * as Sentry from '@sentry/react-router'

describe('auditLog', () => {
	let testUserId: string

	beforeEach(async () => {
		// Create a test user for actor references
		const user = await prisma.user.upsert({
			where: { email: 'audit-test@example.com' },
			update: {},
			create: {
				email: 'audit-test@example.com',
				username: `audit-test-${Date.now()}`,
			},
		})
		testUserId = user.id

		// Clean up any leftover audit logs
		await prisma.auditLog.deleteMany()
	})

	afterEach(async () => {
		await prisma.auditLog.deleteMany()
	})

	test('writes an AuditLog row with all fields', async () => {
		await auditLog({
			action: 'order.statusUpdated',
			entityType: 'Order',
			entityId: 'order-123',
			actorUserId: testUserId,
			actorEmail: 'admin@example.com',
			before: { status: 'CONFIRMED' },
			after: { status: 'SHIPPED' },
			requestId: 'req-abc',
		})

		const logs = await prisma.auditLog.findMany()
		expect(logs).toHaveLength(1)

		const log = logs[0]
		expect(log.action).toBe('order.statusUpdated')
		expect(log.entityType).toBe('Order')
		expect(log.entityId).toBe('order-123')
		expect(log.actorUserId).toBe(testUserId)
		expect(log.actorEmail).toBe('admin@example.com')
		expect(log.before).toEqual({ status: 'CONFIRMED' })
		expect(log.after).toEqual({ status: 'SHIPPED' })
		expect(log.requestId).toBe('req-abc')
		expect(log.createdAt).toBeInstanceOf(Date)
	})

	test('writes an AuditLog row with minimal fields (nulls)', async () => {
		await auditLog({
			action: 'product.deleted',
			entityType: 'Product',
			entityId: 'product-456',
		})

		const logs = await prisma.auditLog.findMany()
		expect(logs).toHaveLength(1)

		const log = logs[0]
		expect(log.action).toBe('product.deleted')
		expect(log.entityType).toBe('Product')
		expect(log.entityId).toBe('product-456')
		expect(log.actorUserId).toBeNull()
		expect(log.actorEmail).toBeNull()
		expect(log.before).toBeNull()
		expect(log.after).toBeNull()
		expect(log.requestId).toBeNull()
	})

	test('does NOT throw when prisma.auditLog.create fails (fire-and-forget)', async () => {
		// Mock prisma.auditLog.create to simulate a DB error
		const originalCreate = prisma.auditLog.create
		prisma.auditLog.create = vi.fn().mockRejectedValueOnce(new Error('DB connection lost'))

		// Should not throw
		await expect(
			auditLog({
				action: 'order.statusUpdated',
				entityType: 'Order',
				entityId: 'order-123',
			}),
		).resolves.toBeUndefined()

		// Should have reported to Sentry
		expect(Sentry.captureException).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				tags: { component: 'audit-log' },
			}),
		)

		// Restore
		prisma.auditLog.create = originalCreate
	})

	test('reports to Sentry on error with action/entity context', async () => {
		const originalCreate = prisma.auditLog.create
		prisma.auditLog.create = vi.fn().mockRejectedValueOnce(new Error('DB error'))

		await auditLog({
			action: 'user.roleChanged',
			entityType: 'User',
			entityId: 'user-789',
			actorUserId: testUserId,
		})

		expect(Sentry.captureException).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				tags: { component: 'audit-log' },
				extra: {
					action: 'user.roleChanged',
					entityType: 'User',
					entityId: 'user-789',
				},
			}),
		)

		prisma.auditLog.create = originalCreate
	})
})

describe('withAudit', () => {
	let testUserId: string

	beforeEach(async () => {
		const user = await prisma.user.upsert({
			where: { email: 'audit-test@example.com' },
			update: {},
			create: {
				email: 'audit-test@example.com',
				username: `audit-test-${Date.now()}`,
			},
		})
		testUserId = user.id

		await prisma.auditLog.deleteMany()
	})

	afterEach(async () => {
		await prisma.auditLog.deleteMany()
	})

	test('loads before, runs mutation, loads after, and writes audit log', async () => {
		let beforeCalled = false
		let mutationCalled = false
		let afterCalled = false

		const result = await withAudit(
			{
				action: 'test.action',
				entityType: 'Test',
				entityId: 'test-1',
				actorUserId: testUserId,
				getBefore: async () => {
					beforeCalled = true
					return { state: 'before' }
				},
				getAfter: async () => {
					afterCalled = true
					return { state: 'after' }
				},
			},
			async () => {
				mutationCalled = true
				return { success: true }
			},
		)

		// Mutation result is returned
		expect(result).toEqual({ success: true })

		// All hooks called in order
		expect(beforeCalled).toBe(true)
		expect(mutationCalled).toBe(true)
		expect(afterCalled).toBe(true)

		// Audit log was written
		const logs = await prisma.auditLog.findMany()
		expect(logs).toHaveLength(1)
		expect(logs[0].action).toBe('test.action')
		expect(logs[0].entityType).toBe('Test')
		expect(logs[0].entityId).toBe('test-1')
		expect(logs[0].actorUserId).toBe(testUserId)
		expect(logs[0].before).toEqual({ state: 'before' })
		expect(logs[0].after).toEqual({ state: 'after' })
	})

	test('returns mutation result unchanged', async () => {
		const result = await withAudit(
			{
				action: 'test.action',
				entityType: 'Test',
				entityId: 'test-2',
			},
			async () => ({ complex: { nested: true, count: 42 } }),
		)

		expect(result).toEqual({ complex: { nested: true, count: 42 } })
	})

	test('propagates mutation errors to caller', async () => {
		const mutationError = new Error('Mutation failed')

		await expect(
			withAudit(
				{
					action: 'test.action',
					entityType: 'Test',
					entityId: 'test-3',
				},
				async () => {
					throw mutationError
				},
			),
		).rejects.toThrow('Mutation failed')

		// No audit log should be written when mutation fails
		const logs = await prisma.auditLog.findMany()
		expect(logs).toHaveLength(0)
	})

	test('handles missing getBefore/getAfter gracefully', async () => {
		const result = await withAudit(
			{
				action: 'test.action',
				entityType: 'Test',
				entityId: 'test-4',
				actorUserId: testUserId,
				// No getBefore or getAfter
			},
			async () => ({ ok: true }),
		)

		expect(result).toEqual({ ok: true })

		const logs = await prisma.auditLog.findMany()
		expect(logs).toHaveLength(1)
		expect(logs[0].before).toBeNull()
		expect(logs[0].after).toBeNull()
	})

	test('catches getBefore errors gracefully (does not block mutation)', async () => {
		const result = await withAudit(
			{
				action: 'test.action',
				entityType: 'Test',
				entityId: 'test-5',
				getBefore: async () => {
					throw new Error('Snapshot unavailable')
				},
				getAfter: async () => ({ state: 'after' }),
			},
			async () => ({ ok: true }),
		)

		// Mutation still succeeds
		expect(result).toEqual({ ok: true })

		// Audit log written with null before, valid after
		const logs = await prisma.auditLog.findMany()
		expect(logs).toHaveLength(1)
		expect(logs[0].before).toBeNull()
		expect(logs[0].after).toEqual({ state: 'after' })
	})

	test('catches getAfter errors gracefully (does not block mutation)', async () => {
		const result = await withAudit(
			{
				action: 'test.action',
				entityType: 'Test',
				entityId: 'test-6',
				getBefore: async () => ({ state: 'before' }),
				getAfter: async () => {
					throw new Error('Snapshot unavailable')
				},
			},
			async () => ({ ok: true }),
		)

		expect(result).toEqual({ ok: true })

		const logs = await prisma.auditLog.findMany()
		expect(logs).toHaveLength(1)
		expect(logs[0].before).toEqual({ state: 'before' })
		expect(logs[0].after).toBeNull()
	})

	test('does not throw if auditLog itself fails inside withAudit', async () => {
		const originalCreate = prisma.auditLog.create
		prisma.auditLog.create = vi.fn().mockRejectedValueOnce(new Error('DB write failed'))

		// withAudit should still return the mutation result
		const result = await withAudit(
			{
				action: 'test.action',
				entityType: 'Test',
				entityId: 'test-7',
				getBefore: async () => ({ state: 'before' }),
				getAfter: async () => ({ state: 'after' }),
			},
			async () => ({ ok: true }),
		)

		expect(result).toEqual({ ok: true })

		prisma.auditLog.create = originalCreate
	})

	test('handles null actorUserId and actorEmail', async () => {
		const result = await withAudit(
			{
				action: 'system.action',
				entityType: 'System',
				entityId: 'system-1',
				actorUserId: null,
				actorEmail: null,
			},
			async () => ({ system: true }),
		)

		expect(result).toEqual({ system: true })

		const logs = await prisma.auditLog.findMany()
		expect(logs).toHaveLength(1)
		expect(logs[0].actorUserId).toBeNull()
		expect(logs[0].actorEmail).toBeNull()
	})
})
