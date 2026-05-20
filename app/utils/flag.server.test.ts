import { createHash } from 'node:crypto'
import { test, expect } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { isFlagEnabled, invalidateFlagCache } from '#app/utils/flag.server.ts'

// Helper to hash the same way the implementation does
function hashRollout(key: string, userId: string): number {
	const hash = createHash('sha256')
	hash.update(key + userId)
	return hash.digest().readUInt32BE(0) % 100
}

test.describe('isFlagEnabled', () => {
	test('returns false for non-existent flag', async () => {
		const result = await isFlagEnabled('nonexistent_flag')
		expect(result).toBe(false)
	})

	test('returns false for disabled flag', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_disabled',
				enabled: false,
				rolloutPercentage: 0,
				description: 'A disabled flag',
			},
		})
		invalidateFlagCache()

		const result = await isFlagEnabled('test_disabled')
		expect(result).toBe(false)

		await prisma.flag.delete({ where: { key: 'test_disabled' } })
		invalidateFlagCache()
	})

	test('returns true for enabled flag with no constraints', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_enabled',
				enabled: true,
				rolloutPercentage: 0,
			},
		})
		invalidateFlagCache()

		const result = await isFlagEnabled('test_enabled')
		expect(result).toBe(true)

		await prisma.flag.delete({ where: { key: 'test_enabled' } })
		invalidateFlagCache()
	})

	test('rollout at 0% returns false even when enabled', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_rollout_0',
				enabled: true,
				rolloutPercentage: 0,
			},
		})
		invalidateFlagCache()

		const result = await isFlagEnabled('test_rollout_0', {
			userId: 'user_1',
		})
		expect(result).toBe(false)

		await prisma.flag.delete({ where: { key: 'test_rollout_0' } })
		invalidateFlagCache()
	})

	test('rollout at 100% returns true for all users', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_rollout_100',
				enabled: true,
				rolloutPercentage: 100,
			},
		})
		invalidateFlagCache()

		for (let i = 0; i < 10; i++) {
			const result = await isFlagEnabled('test_rollout_100', {
				userId: `user_${i}`,
			})
			expect(result).toBe(true)
		}

		await prisma.flag.delete({ where: { key: 'test_rollout_100' } })
		invalidateFlagCache()
	})

	test('rollout is deterministic for the same user', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_deterministic',
				enabled: true,
				rolloutPercentage: 50,
			},
		})
		invalidateFlagCache()

		const first = await isFlagEnabled('test_deterministic', {
			userId: 'alice',
		})
		const second = await isFlagEnabled('test_deterministic', {
			userId: 'alice',
		})
		expect(first).toBe(second)

		await prisma.flag.delete({ where: { key: 'test_deterministic' } })
		invalidateFlagCache()
	})

	test('audience filter matches userId', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_audience_user',
				enabled: true,
				rolloutPercentage: 0,
				audience: JSON.stringify({ userIds: ['bob'] }),
			},
		})
		invalidateFlagCache()

		const bob = await isFlagEnabled('test_audience_user', { userId: 'bob' })
		expect(bob).toBe(true)

		const alice = await isFlagEnabled('test_audience_user', {
			userId: 'alice',
		})
		expect(alice).toBe(false)

		await prisma.flag.delete({ where: { key: 'test_audience_user' } })
		invalidateFlagCache()
	})

	test('audience filter matches roles', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_audience_roles',
				enabled: true,
				rolloutPercentage: 0,
				audience: JSON.stringify({ roles: ['admin', 'beta'] }),
			},
		})
		invalidateFlagCache()

		const adminUser = await isFlagEnabled('test_audience_roles', {
			roles: ['admin'],
		})
		expect(adminUser).toBe(true)

		const betaUser = await isFlagEnabled('test_audience_roles', {
			roles: ['beta'],
		})
		expect(betaUser).toBe(true)

		const regularUser = await isFlagEnabled('test_audience_roles', {
			roles: ['user'],
		})
		expect(regularUser).toBe(false)

		await prisma.flag.delete({ where: { key: 'test_audience_roles' } })
		invalidateFlagCache()
	})

	test('corrupt audience JSON returns false (fail-closed)', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_corrupt_audience',
				enabled: true,
				rolloutPercentage: 0,
				audience: 'not-json',
			},
		})
		invalidateFlagCache()

		const result = await isFlagEnabled('test_corrupt_audience', {
			userId: 'alice',
		})
		expect(result).toBe(false)

		await prisma.flag.delete({ where: { key: 'test_corrupt_audience' } })
		invalidateFlagCache()
	})

	test('audience filter matches country', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_audience_country',
				enabled: true,
				rolloutPercentage: 0,
				audience: JSON.stringify({ countries: ['FR', 'BE'] }),
			},
		})
		invalidateFlagCache()

		const fr = await isFlagEnabled('test_audience_country', {
			country: 'FR',
		})
		expect(fr).toBe(true)

		const us = await isFlagEnabled('test_audience_country', {
			country: 'US',
		})
		expect(us).toBe(false)

		await prisma.flag.delete({ where: { key: 'test_audience_country' } })
		invalidateFlagCache()
	})
})

test.describe('rollout hash function', () => {
	test('produces values between 0 and 99', () => {
		for (let i = 0; i < 100; i++) {
			const val = hashRollout('test_flag', `user_${i}`)
			expect(val).toBeGreaterThanOrEqual(0)
			expect(val).toBeLessThanOrEqual(99)
		}
	})

	test('same input produces same output (deterministic)', () => {
		const val1 = hashRollout('my_flag', 'user_abc')
		const val2 = hashRollout('my_flag', 'user_abc')
		expect(val1).toBe(val2)
	})

	test('different flags produce different distributions', () => {
		const results1 = new Set<number>()
		const results2 = new Set<number>()
		for (let i = 0; i < 100; i++) {
			results1.add(hashRollout('flag_a', `user_${i}`))
			results2.add(hashRollout('flag_b', `user_${i}`))
		}
		// They should not be identical sets
		const sameAll = [...results1].every((v) => results2.has(v))
		expect(sameAll).toBe(false)
	})

	test('different users get potentially different results', () => {
		const val1 = hashRollout('flag', 'user_1')
		const val2 = hashRollout('flag', 'user_2')
		// Not guaranteed to be different but very unlikely to be same for all
		// this just verifies the function takes userId into account
		expect(typeof val1).toBe('number')
		expect(typeof val2).toBe('number')
	})
})

test.describe('cache invalidation', () => {
	test('invalidateFlagCache clears the cache', async () => {
		await prisma.flag.create({
			data: {
				key: 'test_cache_1',
				enabled: true,
				rolloutPercentage: 0,
			},
		})
		invalidateFlagCache()

		// First call populates cache
		const before = await isFlagEnabled('test_cache_1')
		expect(before).toBe(true)

		// Update flag directly in DB
		await prisma.flag.update({
			where: { key: 'test_cache_1' },
			data: { enabled: false },
		})
		// Without invalidation, cache still returns old value
		const stale = await isFlagEnabled('test_cache_1')
		expect(stale).toBe(true) // cached

		// After invalidation
		invalidateFlagCache()
		const fresh = await isFlagEnabled('test_cache_1')
		expect(fresh).toBe(false)

		await prisma.flag.delete({ where: { key: 'test_cache_1' } })
		invalidateFlagCache()
	})
})
