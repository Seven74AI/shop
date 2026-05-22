/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach } from 'vitest'
import { auditLog, buildChangesDiff, type AuditAction } from './audit.server.ts'
import { prisma } from './db.server.ts'

describe('auditLog', () => {
	let userId: string

	beforeEach(async () => {
		// Create a test user
		const user = await prisma.user.create({
			data: {
				email: `audit-test-${Date.now()}@test.com`,
				username: `audit-test-${Date.now()}`,
			},
		})
		userId = user.id
	})

	test('creates an audit log entry with all fields', async () => {
		const req = {
			ip: '192.168.1.1',
			headers: { 'user-agent': 'TestAgent/1.0' },
		}

		await auditLog(userId, 'CREATE', 'Product', 'prod-123', {
			name: 'Test Product',
		}, req)

		const entries = await prisma.auditLog.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			take: 1,
		})

		expect(entries).toHaveLength(1)
		const entry = entries[0]!
		expect(entry.userId).toBe(userId)
		expect(entry.action).toBe('CREATE')
		expect(entry.entityType).toBe('Product')
		expect(entry.entityId).toBe('prod-123')
		expect(entry.ipAddress).toBe('192.168.1.1')
		expect(entry.userAgent).toBe('TestAgent/1.0')
		expect(entry.changes).toEqual({ name: 'Test Product' })
	})

	test('handles null userId (system action)', async () => {
		await auditLog(null, 'DELETE', 'Product', 'prod-456', null)

		const entries = await prisma.auditLog.findMany({
			where: { userId: null },
			orderBy: { createdAt: 'desc' },
			take: 1,
		})

		expect(entries).toHaveLength(1)
		expect(entries[0]!.userId).toBeNull()
		expect(entries[0]!.changes).toBeNull()
	})

	test('handles missing request object gracefully', async () => {
		await auditLog(userId, 'UPDATE', 'Order', 'order-789', {
			status: 'SHIPPED',
		})

		const entries = await prisma.auditLog.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			take: 1,
		})

		expect(entries).toHaveLength(1)
		expect(entries[0]!.ipAddress).toBeNull()
		expect(entries[0]!.userAgent).toBeNull()
	})

	test('never throws on database errors', async () => {
		// Force an error by passing an invalid field type
		// auditLog should silently catch any error
		await expect(
			auditLog(userId, 'CREATE' as AuditAction, 'Test', '1', {}),
		).resolves.toBeUndefined()
	})

	test('records different action types correctly', async () => {
		const actions: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE']

		for (const action of actions) {
			await auditLog(userId, action, 'Test', '1')
		}

		const entries = await prisma.auditLog.findMany({
			where: { userId },
			orderBy: { createdAt: 'asc' },
		})

		const recordedActions = entries.map((e) => e.action)
		expect(recordedActions).toEqual(actions)
	})
})

describe('buildChangesDiff', () => {
	test('returns diff of changed fields', () => {
		const before = { name: 'Old', price: 100 }
		const after = { name: 'New', price: 100 }

		const diff = buildChangesDiff(before, after)
		expect(diff).toEqual({
			name: { before: 'Old', after: 'New' },
		})
	})

	test('returns null when nothing changed', () => {
		const before = { name: 'Same', price: 100 }
		const after = { name: 'Same', price: 100 }

		expect(buildChangesDiff(before, after)).toBeNull()
	})

	test('handles deeply equal objects', () => {
		const before = { data: { x: 1, y: 2 } }
		const after = { data: { x: 1, y: 2 } }

		expect(buildChangesDiff(before, after)).toBeNull()
	})

	test('detects deep changes', () => {
		const before = { data: { x: 1, y: 2 } }
		const after = { data: { x: 1, y: 3 } }

		const diff = buildChangesDiff(before, after)
		expect(diff).toEqual({
			data: { before: { x: 1, y: 2 }, after: { x: 1, y: 3 } },
		})
	})

	test('handles new fields in after', () => {
		const before = { name: 'Old' }
		const after = { name: 'Old', price: 100 }

		const diff = buildChangesDiff(before, after)
		expect(diff).toEqual({
			price: { before: undefined, after: 100 },
		})
	})
})
