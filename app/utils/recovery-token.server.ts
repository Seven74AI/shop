import { createHmac, timingSafeEqual } from 'node:crypto'

const RECOVERY_TOKEN_SEPARATOR = '.'
const RECOVERY_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function getSigningKey(): string {
	const secret = process.env.SESSION_SECRET
	if (!secret) throw new Error('SESSION_SECRET is required for recovery tokens')
	// Use first secret if comma-separated for rotation
	return secret.split(',')[0]!
}

/**
 * Creates a signed cart recovery token containing cartId, userId, and expiry.
 * Each part is individually base64url-encoded to avoid conflicts with the
 * '.' separator character.
 *
 * Format: base64url(cartId).base64url(userId).base64url(expiry).signature
 * where signature = HMAC-SHA256(cartId.userId.expiry, SESSION_SECRET)
 */
export function createRecoveryToken(cartId: string, userId: string): string {
	const expiry = Date.now() + RECOVERY_EXPIRY_MS
	const encodedCartId = Buffer.from(cartId).toString('base64url')
	const encodedUserId = Buffer.from(userId).toString('base64url')
	const encodedExpiry = Buffer.from(String(expiry)).toString('base64url')
	const payload = `${encodedCartId}${RECOVERY_TOKEN_SEPARATOR}${encodedUserId}${RECOVERY_TOKEN_SEPARATOR}${encodedExpiry}`
	const signingKey = getSigningKey()
	const signature = createHmac('sha256', signingKey).update(payload).digest()
	const token = Buffer.concat([
		Buffer.from(payload),
		Buffer.from(RECOVERY_TOKEN_SEPARATOR),
		signature,
	])
	return token.toString('base64url')
}

/**
 * Verifies a cart recovery token, returning { cartId, userId } if valid.
 * Returns null if the token is invalid, tampered, or expired.
 */
export function verifyRecoveryToken(token: string): {
	cartId: string
	userId: string
} | null {
	try {
		const raw = Buffer.from(token, 'base64url')
		// Find the last separator — the signature comes after it
		const lastSep = raw.lastIndexOf(
			Buffer.from(RECOVERY_TOKEN_SEPARATOR)[0]!,
		)
		if (lastSep === -1) return null

		const payload = raw.subarray(0, lastSep)
		const signature = raw.subarray(lastSep + 1)

		// Verify HMAC
		const signingKey = getSigningKey()
		const expectedSig = createHmac('sha256', signingKey)
			.update(payload)
			.digest()
		if (!timingSafeEqual(signature, expectedSig)) return null

		// Parse payload: encodedCartId.encodedUserId.encodedExpiry
		const payloadStr = payload.toString('utf-8')
		// Split only the first two separators — the expiry is everything after
		const firstSep = payloadStr.indexOf(RECOVERY_TOKEN_SEPARATOR)
		if (firstSep === -1) return null
		const secondSep = payloadStr.indexOf(
			RECOVERY_TOKEN_SEPARATOR,
			firstSep + 1,
		)
		if (secondSep === -1) return null

		const encodedCartId = payloadStr.slice(0, firstSep)
		const encodedUserId = payloadStr.slice(firstSep + 1, secondSep)
		const encodedExpiry = payloadStr.slice(secondSep + 1)

		const cartId = Buffer.from(encodedCartId, 'base64url').toString('utf-8')
		const userId = Buffer.from(encodedUserId, 'base64url').toString('utf-8')
		const expiry = Number.parseInt(
			Buffer.from(encodedExpiry, 'base64url').toString('utf-8'),
			10,
		)
		if (!Number.isFinite(expiry)) return null

		// Check expiry
		if (Date.now() > expiry) return null

		return { cartId, userId }
	} catch {
		return null
	}
}
