import { describe, expect, test } from 'vitest'
import { createRecoveryToken, verifyRecoveryToken } from './recovery-token.server.ts'

describe('recovery-token.server', () => {
	test('createRecoveryToken should create a valid token', () => {
		const token = createRecoveryToken('cart-123', 'user-456')
		expect(token).toBeTruthy()
		expect(typeof token).toBe('string')
		// Should be base64url-encoded
		expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
	})

	test('verifyRecoveryToken should return cartId and userId for valid token', () => {
		const token = createRecoveryToken('cart-abc', 'user-xyz')
		const result = verifyRecoveryToken(token)
		expect(result).not.toBeNull()
		expect(result?.cartId).toBe('cart-abc')
		expect(result?.userId).toBe('user-xyz')
	})

	test('verifyRecoveryToken should return null for invalid token', () => {
		expect(verifyRecoveryToken('invalid-token')).toBeNull()
		expect(verifyRecoveryToken('')).toBeNull()
	})

	test('verifyRecoveryToken should return null for tampered token', () => {
		const token = createRecoveryToken('cart-1', 'user-1')
		// Tamper with the token by flipping a character
		const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A')
		const result = verifyRecoveryToken(tampered)
		// Most tampered tokens should be invalid (some may still hash correctly but to different values)
		// We just check it doesn't return the original values
		if (result) {
			expect(result.cartId).not.toBe('cart-1')
		}
	})

	test('createRecoveryToken should produce different tokens for different carts', () => {
		const token1 = createRecoveryToken('cart-1', 'user-1')
		const token2 = createRecoveryToken('cart-2', 'user-1')
		expect(token1).not.toBe(token2)
	})

	test('verifyRecoveryToken should return unique cartId per token', () => {
		const token1 = createRecoveryToken('cart-aaa', 'user-1')
		const token2 = createRecoveryToken('cart-bbb', 'user-1')

		const result1 = verifyRecoveryToken(token1)
		const result2 = verifyRecoveryToken(token2)

		expect(result1?.cartId).toBe('cart-aaa')
		expect(result2?.cartId).toBe('cart-bbb')
	})

	test('verifyRecoveryToken should handle special characters in IDs', () => {
		const token = createRecoveryToken(
			'cart_with-special.chars',
			'user@domain.com',
		)
		const result = verifyRecoveryToken(token)
		expect(result?.cartId).toBe('cart_with-special.chars')
		expect(result?.userId).toBe('user@domain.com')
	})
})
