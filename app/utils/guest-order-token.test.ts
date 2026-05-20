import { describe, expect, it, beforeEach } from 'vitest'
import { createGuestOrderToken, verifyGuestOrderToken } from './guest-order-token.server.ts'

// The test env should have SESSION_SECRET set
// Tests use the session secret from the environment

describe('guest-order-token', () => {
	beforeEach(() => {
		process.env.SESSION_SECRET = 'test-secret-for-guest-order-tokens'
	})

	describe('createGuestOrderToken', () => {
		it('returns a string with two parts separated by a dot', () => {
			const token = createGuestOrderToken('ORD-000001', 'test@example.com')
			expect(typeof token).toBe('string')
			const parts = token.split('.')
			expect(parts).toHaveLength(2)
			expect(parts[0].length).toBeGreaterThan(0)
			expect(parts[1].length).toBeGreaterThan(0)
		})

		it('lowercases the email in the payload', () => {
			const token = createGuestOrderToken('ORD-000001', 'Test@Example.COM')
			const payload = verifyGuestOrderToken(token)
			expect(payload).not.toBeNull()
			expect(payload!.email).toBe('test@example.com')
		})

		it('creates tokens that differ for different order numbers', () => {
			const token1 = createGuestOrderToken('ORD-000001', 'test@example.com')
			const token2 = createGuestOrderToken('ORD-000002', 'test@example.com')
			expect(token1).not.toBe(token2)
		})

		it('creates tokens that differ for different emails', () => {
			const token1 = createGuestOrderToken('ORD-000001', 'test@example.com')
			const token2 = createGuestOrderToken('ORD-000001', 'other@example.com')
			expect(token1).not.toBe(token2)
		})

		it('supports custom expiry time', () => {
			const token = createGuestOrderToken('ORD-000001', 'test@example.com', 5)
			const payload = verifyGuestOrderToken(token)
			expect(payload).not.toBeNull()
			// Token should still be valid (created just now)
		})
	})

	describe('verifyGuestOrderToken', () => {
		it('returns payload for a valid token', () => {
			const token = createGuestOrderToken('ORD-000001', 'test@example.com')
			const payload = verifyGuestOrderToken(token)
			expect(payload).not.toBeNull()
			expect(payload!.orderNumber).toBe('ORD-000001')
			expect(payload!.email).toBe('test@example.com')
		})

		it('returns null for an empty string', () => {
			expect(verifyGuestOrderToken('')).toBeNull()
		})

		it('returns null for a token without a signature', () => {
			expect(verifyGuestOrderToken('payloadonly')).toBeNull()
		})

		it('returns null for a token with too many parts', () => {
			expect(verifyGuestOrderToken('a.b.c')).toBeNull()
		})

		it('returns null for a tampered token (modified payload)', () => {
			const token = createGuestOrderToken('ORD-000001', 'test@example.com')
			const parts = token.split('.')
			// Modify the payload by flipping a character
			const flippedPayload =
				parts[0].slice(0, -1) +
				(parts[0].slice(-1) === 'A' ? 'B' : 'A')
			expect(verifyGuestOrderToken(`${flippedPayload}.${parts[1]}`)).toBeNull()
		})

		it('returns null for a tampered token (modified email claim)', () => {
			// Create a token with one email, then manually change the signature
			const token = createGuestOrderToken('ORD-000001', 'real@example.com')
			// Create another token to get a wrong signature
			const otherToken = createGuestOrderToken('ORD-000001', 'wrong@example.com')
			const parts = token.split('.')
			const otherParts = otherToken.split('.')
			// Swap signatures: payload from first, signature from second
			expect(verifyGuestOrderToken(`${parts[0]}.${otherParts[1]}`)).toBeNull()
		})

		it('returns null for an expired token', async () => {
			// Create a token with 0-minute expiry (already expired)
			const token = createGuestOrderToken('ORD-000001', 'test@example.com', 0)
			// Wait a tiny bit to ensure the timestamp passes
			await new Promise((resolve) => setTimeout(resolve, 10))
			expect(verifyGuestOrderToken(token)).toBeNull()
		})

		it('returns null when payload is not valid JSON', () => {
			// Construct a token with bad base64url payload
			const badPayload = Buffer.from('not-json').toString('base64url')
			const crypto = require('crypto')
			const secret = process.env.SESSION_SECRET!
			const sig = crypto
				.createHmac('sha256', secret)
				.update(badPayload)
				.digest('base64url')
			expect(verifyGuestOrderToken(`${badPayload}.${sig}`)).toBeNull()
		})

		it('returns null when payload has missing fields', () => {
			const crypto = require('crypto')
			const secret = process.env.SESSION_SECRET!

			// Missing orderNumber
			const incompletePayload = JSON.stringify({ email: 'test@example.com', exp: 9999999999 })
			const incompleteEncoded = Buffer.from(incompletePayload).toString('base64url')
			const incompleteSig = crypto
				.createHmac('sha256', secret)
				.update(incompleteEncoded)
				.digest('base64url')
			expect(verifyGuestOrderToken(`${incompleteEncoded}.${incompleteSig}`)).toBeNull()
		})

		it('returns null when payload has wrong field types', () => {
			const crypto = require('crypto')
			const secret = process.env.SESSION_SECRET!

			const badPayload = JSON.stringify({
				orderNumber: 123,
				email: 'test@example.com',
				exp: 9999999999,
			})
			const badEncoded = Buffer.from(badPayload).toString('base64url')
			const badSig = crypto
				.createHmac('sha256', secret)
				.update(badEncoded)
				.digest('base64url')
			expect(verifyGuestOrderToken(`${badEncoded}.${badSig}`)).toBeNull()
		})

		it('validates correctly with different SESSION_SECRET', () => {
			// Token created with one secret should not verify with another
			const token = createGuestOrderToken('ORD-000001', 'test@example.com')
			process.env.SESSION_SECRET = 'different-secret'
			expect(verifyGuestOrderToken(token)).toBeNull()
		})
	})
})
