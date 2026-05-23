import { describe, test, expect, beforeEach } from 'vitest'
import { generateGuestToken, verifyGuestToken } from './guest-token.server.ts'

const TEST_SECRET = 'test-guest-secret-32-bytes-long!!'

beforeEach(() => {
	process.env.GUEST_SECRET = TEST_SECRET
})

describe('generateGuestToken', () => {
	test('generates a token string in the format payload.signature', () => {
		const token = generateGuestToken('order-123', 'guest@example.com')
		expect(token).toBeTypeOf('string')
		// Token should have exactly one dot separator
		const parts = token.split('.')
		expect(parts).toHaveLength(2)
		// Both parts should be base64url (no + / or =)
		for (const part of parts) {
			expect(part).not.toContain('+')
			expect(part).not.toContain('/')
			expect(part).not.toContain('=')
		}
	})

	test('generates different tokens for different orders', () => {
		const token1 = generateGuestToken('order-1', 'guest@example.com')
		const token2 = generateGuestToken('order-2', 'guest@example.com')
		expect(token1).not.toBe(token2)
	})

	test('generates different tokens for different emails', () => {
		const token1 = generateGuestToken('order-1', 'alice@example.com')
		const token2 = generateGuestToken('order-1', 'bob@example.com')
		expect(token1).not.toBe(token2)
	})

	test('generates tokens with unique timestamps for successive calls', async () => {
		// Token expiry uses Unix seconds, not milliseconds.
		// Two calls must be >1s apart to produce different tokens.
		const token1 = generateGuestToken('order-x', 'user@example.com')
		await new Promise((r) => setTimeout(r, 1100))
		const token2 = generateGuestToken('order-x', 'user@example.com')
		expect(token1).not.toBe(token2)
	}, 5000) // timeout for the delay
})

describe('verifyGuestToken', () => {
	test('round-trips: valid token returns correct payload', () => {
		const token = generateGuestToken('order-abc', 'user@test.com')
		const result = verifyGuestToken(token)
		expect(result).not.toBeNull()
		expect(result!.orderId).toBe('order-abc')
		expect(result!.email).toBe('user@test.com')
	})

	test('verifies expiry is in the future for valid token', () => {
		const token = generateGuestToken('order-abc', 'user@test.com')
		const result = verifyGuestToken(token)
		expect(result).not.toBeNull()
		expect(result!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
	})

	test('rejects tampered payload', () => {
		const token = generateGuestToken('order-let', 'user@test.com')
		// Tamper with the payload part but keep signature
		const [payloadB64, sigB64] = token.split('.')
		const tamperedPayloadB64 = Buffer.from(
			JSON.stringify({ orderId: 'order-bad', email: 'hacker@evil.com', exp: 9999999999 }),
		).toString('base64url')
		const tamperedToken = `${tamperedPayloadB64}.${sigB64}`
		expect(verifyGuestToken(tamperedToken)).toBeNull()
	})

	test('rejects tampered signature', () => {
		const token = generateGuestToken('order-let', 'user@test.com')
		const [payloadB64] = token.split('.')
		// Replace with random signature
		const fakeSigB64 = Buffer.from('not-the-real-hmac').toString('base64url')
		const tamperedToken = `${payloadB64}.${fakeSigB64}`
		expect(verifyGuestToken(tamperedToken)).toBeNull()
	})

	test('rejects expired token', () => {
		// Manually craft an expired token
		const expiredPayload = {
			orderId: 'order-old',
			email: 'old@test.com',
			exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
		}
		const crypto = require('node:crypto')
		const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url')
		const hmac = crypto.createHmac('sha256', TEST_SECRET)
		hmac.update(payloadB64)
		const sigB64 = hmac.digest('base64url')
		const expiredToken = `${payloadB64}.${sigB64}`

		expect(verifyGuestToken(expiredToken)).toBeNull()
	})

	test('rejects malformed token (no dot)', () => {
		expect(verifyGuestToken('not-a-valid-token')).toBeNull()
	})

	test('rejects malformed token (too many dots)', () => {
		const token = generateGuestToken('order-1', 'user@test.com')
		const badToken = `${token}.extra`
		expect(verifyGuestToken(badToken)).toBeNull()
	})

	test('rejects token with invalid JSON payload', () => {
		const badPayload = Buffer.from('not-json').toString('base64url')
		const badSig = Buffer.from('bad').toString('base64url')
		expect(verifyGuestToken(`${badPayload}.${badSig}`)).toBeNull()
	})

	test('rejects token with missing fields in payload', () => {
		const crypto = require('node:crypto')
		const badPayload = { orderId: 'only-id' } // missing email and exp
		const payloadB64 = Buffer.from(JSON.stringify(badPayload)).toString('base64url')
		const hmac = crypto.createHmac('sha256', TEST_SECRET)
		hmac.update(payloadB64)
		const sigB64 = hmac.digest('base64url')
		const badToken = `${payloadB64}.${sigB64}`

		expect(verifyGuestToken(badToken)).toBeNull()
	})

	test('rejects token when GUEST_SECRET is not set', () => {
		process.env.GUEST_SECRET = ''
		const token = generateGuestToken('order-1', 'user@test.com')
		expect(token).toBe('')
		expect(verifyGuestToken('anything.here')).toBeNull()
	})

	test('token generated with one secret fails verification with a different secret', () => {
		const token = generateGuestToken('order-xyz', 'user@test.com')
		// Change the secret
		process.env.GUEST_SECRET = 'completely-different-secret-here!!'
		expect(verifyGuestToken(token)).toBeNull()
	})
})
