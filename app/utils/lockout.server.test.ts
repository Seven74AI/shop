import { faker } from '@faker-js/faker'
import { describe, expect, test, beforeEach } from 'vitest'
import { prisma } from './db.server.ts'
import {
	checkLockout,
	recordFailedAttempt,
	resetAttempts,
} from './lockout.server.ts'

let userId: string

beforeEach(async () => {
	// Create a fresh test user for each test
	const userData = {
		username: faker.string.alphanumeric({ length: 10 }).toLowerCase(),
		email: `${faker.string.alphanumeric(8)}@test.com`,
	}
	const user = await prisma.user.create({
		data: userData,
		select: { id: true },
	})
	userId = user.id
})

// Helper: insert N failed attempts at a specific offset from now.
async function seedFailedAttempts(
	count: number,
	msAgo: number = 0,
): Promise<void> {
	const baseTime = new Date(Date.now() - msAgo)
	const records = Array.from({ length: count }, (_, i) => ({
		userId,
		success: false,
		failureReason: 'Invalid password',
		createdAt: new Date(baseTime.getTime() + i * 1000), // 1s apart
	}))
	await prisma.loginAttempt.createMany({ data: records })
}

describe('checkLockout', () => {
	test('returns not locked when there are no failed attempts', async () => {
		const result = await checkLockout(userId)
		expect(result.locked).toBe(false)
		expect(result.attempts).toBe(0)
	})

	test('returns not locked when below threshold (4 attempts)', async () => {
		await seedFailedAttempts(4, 60_000)

		const result = await checkLockout(userId)
		expect(result.locked).toBe(false)
		expect(result.attempts).toBe(4)
	})

	test('returns locked at 5 attempts (5-minute lock)', async () => {
		await seedFailedAttempts(5, 30_000) // 30s ago

		const result = await checkLockout(userId)
		expect(result.locked).toBe(true)
		expect(result.attempts).toBe(5)
		expect(result.retryAfterMs).toBeGreaterThan(0)
		// Should be locked for ~4min 30s
		expect(result.retryAfterMs).toBeLessThanOrEqual(5 * 60 * 1000)
	})

	test('returns locked at 10 attempts (30-minute lock)', async () => {
		await seedFailedAttempts(10, 60_000) // 1 min ago

		const result = await checkLockout(userId)
		expect(result.locked).toBe(true)
		expect(result.attempts).toBe(10)
		// Should be locked for ~29 min
		expect(result.retryAfterMs).toBeLessThanOrEqual(30 * 60 * 1000)
	})

	test('returns locked at 15 attempts (1-hour lock)', async () => {
		await seedFailedAttempts(15, 120_000) // 2 min ago

		const result = await checkLockout(userId)
		expect(result.locked).toBe(true)
		expect(result.attempts).toBe(15)
		// Should be locked for ~58 min
		expect(result.retryAfterMs).toBeLessThanOrEqual(60 * 60 * 1000)
	})

	test('returns not locked when lockout period has expired', async () => {
		// Create 5 attempts from 10 minutes ago (lockout expired)
		await seedFailedAttempts(5, 10 * 60 * 1000)

		const result = await checkLockout(userId)
		expect(result.locked).toBe(false)
		expect(result.attempts).toBe(5)
	})
})

describe('recordFailedAttempt', () => {
	test('creates a failed login attempt record', async () => {
		const request = new Request('https://example.com/login', {
			headers: {
				'user-agent': 'TestBrowser/1.0',
				'x-forwarded-for': '192.168.1.1',
			},
		})

		await recordFailedAttempt(userId, request)

		const attempts = await prisma.loginAttempt.findMany({
			where: { userId, success: false },
		})
	expect(attempts).toHaveLength(1)
	const a = attempts[0]!
	expect(a.success).toBe(false)
	expect(a.ipAddress).toBe('192.168.1.1')
	expect(a.userAgent).toBe('TestBrowser/1.0')
	expect(a.failureReason).toBe(
			'Invalid username or password',
		)
	})

	test('extracts IP from x-real-ip when x-forwarded-for is absent', async () => {
		const request = new Request('https://example.com/login', {
			headers: { 'x-real-ip': '10.0.0.1' },
		})

		await recordFailedAttempt(userId, request)

		const attempts = await prisma.loginAttempt.findMany({
			where: { userId },
		})
		const a = attempts[0]!
		expect(a.ipAddress).toBe('10.0.0.1')
	})

	test('handles missing IP headers gracefully', async () => {
		const request = new Request('https://example.com/login')

		await recordFailedAttempt(userId, request)

		const attempts = await prisma.loginAttempt.findMany({
			where: { userId },
		})
		const b = attempts[0]!
		expect(b.ipAddress).toBeNull()
		expect(b.userAgent).toBeNull()
	})
})

describe('resetAttempts', () => {
	test('deletes all login attempts for the user', async () => {
		await seedFailedAttempts(5)

		await resetAttempts(userId)

		const count = await prisma.loginAttempt.count({
			where: { userId },
		})
		expect(count).toBe(0)
	})

	test('after reset, checkLockout returns not locked', async () => {
		await seedFailedAttempts(5)

		await resetAttempts(userId)

		const result = await checkLockout(userId)
		expect(result.locked).toBe(false)
		expect(result.attempts).toBe(0)
	})
})

describe('full lockout flow', () => {
	test('locked → expired → not locked cycle', async () => {
		// 5 attempts 10min ago = expired lockout
		await seedFailedAttempts(5, 10 * 60 * 1000)

		let result = await checkLockout(userId)
		expect(result.locked).toBe(false)
		expect(result.attempts).toBe(5)

		// Add 1 more recent attempt — still 6 total but should re-trigger
		await seedFailedAttempts(1, 10_000)

		result = await checkLockout(userId)
		// 6 attempts, most recent 10s ago = locked for 5 min
		expect(result.locked).toBe(true)
		expect(result.attempts).toBe(6)
	})

	test('tier progression: 5→10→15', async () => {
		await seedFailedAttempts(5, 30_000)
		let result = await checkLockout(userId)
		expect(result.locked).toBe(true)
		// ~4min30s remaining
		expect(result.retryAfterMs).toBeGreaterThan(0)
		expect(result.retryAfterMs).toBeLessThanOrEqual(5 * 60 * 1000)

		// Add 5 more = 10 total
		await seedFailedAttempts(5, 15_000)
		result = await checkLockout(userId)
		expect(result.locked).toBe(true)
		expect(result.attempts).toBe(10)
		// Now should be on 30-min tier (most recent 15s ago)
		expect(result.retryAfterMs).toBeLessThanOrEqual(30 * 60 * 1000)

		// Add 5 more = 15 total
		await seedFailedAttempts(5, 5_000)
		result = await checkLockout(userId)
		expect(result.locked).toBe(true)
		expect(result.attempts).toBe(15)
		// Now should be on 1-hour tier
		expect(result.retryAfterMs).toBeLessThanOrEqual(60 * 60 * 1000)
	})
})
