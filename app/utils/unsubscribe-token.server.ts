import { createHmac, timingSafeEqual } from 'node:crypto'

const UNSUBSCRIBE_TOKEN_SEPARATOR = '.'
const UNSUBSCRIBE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function getSigningKey(): string {
	const secret = process.env.SESSION_SECRET
	if (!secret) throw new Error('SESSION_SECRET is required for unsubscribe tokens')
	// Use first secret if comma-separated for rotation
	return secret.split(',')[0]!
}

/**
 * Creates a signed unsubscribe token containing userId and expiry timestamp.
 * Format: base64url(userId.expiry.signature)
 * where signature = HMAC-SHA256(userId.expiry, SESSION_SECRET)
 */
export function createUnsubscribeToken(userId: string): string {
	const expiry = Date.now() + UNSUBSCRIBE_EXPIRY_MS
	const payload = `${userId}${UNSUBSCRIBE_TOKEN_SEPARATOR}${expiry}`
	const signingKey = getSigningKey()
	const signature = createHmac('sha256', signingKey).update(payload).digest()
	const token = Buffer.concat([
		Buffer.from(payload),
		Buffer.from(UNSUBSCRIBE_TOKEN_SEPARATOR),
		signature,
	])
	return token.toString('base64url')
}

/**
 * Verifies an unsubscribe token, returning the userId if valid.
 * Returns null if the token is invalid, tampered, or expired.
 */
export function verifyUnsubscribeToken(token: string): string | null {
	try {
		const raw = Buffer.from(token, 'base64url')
		// Find the last separator — the signature comes after it
		const lastSep = raw.lastIndexOf(Buffer.from(UNSUBSCRIBE_TOKEN_SEPARATOR)[0]!)
		if (lastSep === -1) return null

		const payload = raw.subarray(0, lastSep)
		const signature = raw.subarray(lastSep + 1)

		// Verify HMAC
		const signingKey = getSigningKey()
		const expectedSig = createHmac('sha256', signingKey).update(payload).digest()
		if (!timingSafeEqual(signature, expectedSig)) return null

		// Parse payload: userId.expiry
		const payloadStr = payload.toString('utf-8')
		const sepIdx = payloadStr.indexOf(UNSUBSCRIBE_TOKEN_SEPARATOR)
		if (sepIdx === -1) return null

		const userId = payloadStr.slice(0, sepIdx)
		const expiryStr = payloadStr.slice(sepIdx + 1)
		const expiry = Number.parseInt(expiryStr, 10)
		if (!Number.isFinite(expiry)) return null

		// Check expiry
		if (Date.now() > expiry) return null

		return userId
	} catch {
		return null
	}
}
