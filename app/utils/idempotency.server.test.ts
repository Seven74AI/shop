import { test, expect, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	withIdempotency,
	IdempotencyConflictError,
	generateCheckoutKey,
} from '#app/utils/idempotency.server.ts'

test.describe('generateCheckoutKey', () => {
	test('generates a key containing the cart ID and a time window', () => {
		const key = generateCheckoutKey('cart_abc123')
		expect(key).toMatch(/^checkout_cart_abc123_\d+$/)
	})

	test('generates the same key within the same time window', () => {
		const baseTime = 1700000000000 // Fixed timestamp
		vi.spyOn(Date, 'now').mockReturnValue(baseTime)
		const key1 = generateCheckoutKey('cart_abc123')

		// Advance by 30 seconds — still in same 60s window
		vi.mocked(Date.now).mockReturnValue(baseTime + 30_000)
		const key2 = generateCheckoutKey('cart_abc123')

		expect(key1).toBe(key2)

		// Advance past the window
		vi.mocked(Date.now).mockReturnValue(baseTime + 70_000)
		const key3 = generateCheckoutKey('cart_abc123')
		expect(key3).not.toBe(key1)

		vi.mocked(Date.now).mockRestore()
	})

	test('generates different keys for different carts in the same window', () => {
		const key1 = generateCheckoutKey('cart_aaa')
		const key2 = generateCheckoutKey('cart_bbb')
		expect(key1).not.toBe(key2)
	})
})

test.describe('withIdempotency', () => {
	test('executes the operation and stores the result', async () => {
		const key = `test_success_${Date.now()}`
		const response = { id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' }

		const result = await withIdempotency(key, 'checkout_session', async () => {
			return response
		})

		expect(result).toEqual(response)

		// Verify the record was stored
		const record = await prisma.idempotencyRecord.findUnique({
			where: { idempotencyKey: key },
		})
		expect(record).toBeTruthy()
		expect(record!.status).toBe('completed')
		expect(record!.response).toEqual(response)
		expect(record!.operationType).toBe('checkout_session')

		// Cleanup
		await prisma.idempotencyRecord.delete({ where: { idempotencyKey: key } })
	})

	test('returns cached response on subsequent calls with same key', async () => {
		const key = `test_cache_${Date.now()}`
		const response = { id: 'cs_test_456', url: 'https://checkout.stripe.com/pay/cs_test_456' }
		let callCount = 0

		// First call — executes
		const result1 = await withIdempotency(key, 'checkout_session', async () => {
			callCount++
			return response
		})
		expect(result1).toEqual(response)
		expect(callCount).toBe(1)

		// Second call — returns cached, does NOT execute
		const result2 = await withIdempotency(key, 'checkout_session', async () => {
			callCount++
			return { id: 'different', url: 'different' }
		})
		expect(result2).toEqual(response) // Same cached response
		expect(callCount).toBe(1) // Callback was NOT called again

		// Verify only one record
		const record = await prisma.idempotencyRecord.findUnique({
			where: { idempotencyKey: key },
		})
		expect(record!.status).toBe('completed')

		// Cleanup
		await prisma.idempotencyRecord.delete({ where: { idempotencyKey: key } })
	})

	test('throws IdempotencyConflictError when operation is in progress', async () => {
		const key = `test_conflict_${Date.now()}`

		// Create a "processing" record directly (simulating in-flight operation)
		await prisma.idempotencyRecord.create({
			data: {
				idempotencyKey: key,
				operationType: 'checkout_session',
				status: 'processing',
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			},
		})

		await expect(
			withIdempotency(key, 'checkout_session', async () => ({ id: 'test' })),
		).rejects.toThrow(IdempotencyConflictError)
		await expect(
			withIdempotency(key, 'checkout_session', async () => ({ id: 'test' })),
		).rejects.toThrow(/already in progress/)

		// Cleanup
		await prisma.idempotencyRecord.delete({ where: { idempotencyKey: key } })
	})

	test('retries after a failed operation', async () => {
		const key = `test_retry_${Date.now()}`
		const response = { id: 'cs_test_789', url: 'https://checkout.stripe.com/pay/cs_test_789' }

		// First attempt — fails
		await expect(
			withIdempotency(key, 'checkout_session', async () => {
				throw new Error('Stripe API error')
			}),
		).rejects.toThrow('Stripe API error')

		// Verify it's marked as failed
		let record = await prisma.idempotencyRecord.findUnique({
			where: { idempotencyKey: key },
		})
		expect(record!.status).toBe('failed')

		// Second attempt — succeeds (retry after failure)
		const result = await withIdempotency(key, 'checkout_session', async () => {
			return response
		})
		expect(result).toEqual(response)

		// Verify it's now completed
		record = await prisma.idempotencyRecord.findUnique({
			where: { idempotencyKey: key },
		})
		expect(record!.status).toBe('completed')
		expect(record!.response).toEqual(response)

		// Cleanup
		await prisma.idempotencyRecord.delete({ where: { idempotencyKey: key } })
	})

	test('passes the idempotencyKey to the execute callback', async () => {
		const key = `test_key_pass_${Date.now()}`
		let receivedKey = ''

		await withIdempotency(key, 'checkout_session', async (stripeKey) => {
			receivedKey = stripeKey
			return { id: 'cs_test_key_pass' }
		})

		// The key passed to the callback should match the original key
		expect(receivedKey).toBe(key)

		// Cleanup
		await prisma.idempotencyRecord.delete({ where: { idempotencyKey: key } })
	})

	test('stores response as JSON for complex objects', async () => {
		const key = `test_json_${Date.now()}`
		const complexResponse = {
			id: 'cs_test_complex',
			object: 'checkout.session',
			amount_total: 10000,
			currency: 'eur',
			metadata: { cartId: 'cart_xyz', userId: 'user_abc' },
			line_items: { object: 'list', data: [], has_more: false },
		}

		const result = await withIdempotency(key, 'checkout_session', async () => {
			return complexResponse
		})

		expect(result).toEqual(complexResponse)
		expect(result.metadata.cartId).toBe('cart_xyz')

		// Verify stored as JSON
		const record = await prisma.idempotencyRecord.findUnique({
			where: { idempotencyKey: key },
		})
		expect(record!.response).toEqual(complexResponse)

		// Cleanup
		await prisma.idempotencyRecord.delete({ where: { idempotencyKey: key } })
	})

	test('handles sequential operations with different keys independently', async () => {
		const key1 = `test_independent_1_${Date.now()}`
		const key2 = `test_independent_2_${Date.now() + 1}`
		const response1 = { id: 'cs_1' }
		const response2 = { id: 'cs_2' }

		const result1 = await withIdempotency(key1, 'op_a', async () => response1)
		const result2 = await withIdempotency(key2, 'op_b', async () => response2)

		expect(result1).toEqual(response1)
		expect(result2).toEqual(response2)
		expect(result1).not.toEqual(result2)

		// Both records should exist independently
		const record1 = await prisma.idempotencyRecord.findUnique({
			where: { idempotencyKey: key1 },
		})
		const record2 = await prisma.idempotencyRecord.findUnique({
			where: { idempotencyKey: key2 },
		})
		expect(record1!.status).toBe('completed')
		expect(record2!.status).toBe('completed')
		expect(record1!.operationType).toBe('op_a')
		expect(record2!.operationType).toBe('op_b')

		// Cleanup
		await prisma.idempotencyRecord.delete({ where: { idempotencyKey: key1 } })
		await prisma.idempotencyRecord.delete({ where: { idempotencyKey: key2 } })
	})
})
