import { createHmac } from 'node:crypto'

interface GuestTokenPayload {
	orderId: string
	email: string
	exp: number // Unix timestamp in seconds
}

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

/**
 * Generates a time-limited HMAC-signed token for guest order lookup.
 * Token format: base64url(payload).base64url(HMAC-SHA256(payload))
 *
 * Returns empty string if GUEST_SECRET is not configured.
 */
export function generateGuestToken(orderId: string, email: string): string {
	const secret = process.env.GUEST_SECRET
	if (!secret) return ''

	const now = Math.floor(Date.now() / 1000)
	const expiry = now + TOKEN_TTL_SECONDS

	const payload: GuestTokenPayload = {
		orderId,
		email,
		exp: expiry,
	}

	const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
	const hmac = createHmac('sha256', secret)
	hmac.update(payloadB64)
	const sigB64 = hmac.digest('base64url')

	return `${payloadB64}.${sigB64}`
}

/**
 * Verifies a guest token. Returns the embedded payload if the token is valid
 * (correct HMAC, not expired, well-formed), or null otherwise.
 *
 * Returns null immediately if GUEST_SECRET is not configured.
 */
export function verifyGuestToken(token: string): GuestTokenPayload | null {
	const secret = process.env.GUEST_SECRET
	if (!secret) return null

	// Must have exactly one dot
	const dotIdx = token.indexOf('.')
	if (dotIdx === -1) return null
	if (token.indexOf('.', dotIdx + 1) !== -1) return null

	const payloadB64 = token.slice(0, dotIdx)
	const sigB64 = token.slice(dotIdx + 1)

	// Both parts must be non-empty
	if (!payloadB64 || !sigB64) return null

	// Verify HMAC
	const hmac = createHmac('sha256', secret)
	hmac.update(payloadB64)
	const expectedSigB64 = hmac.digest('base64url')
	if (sigB64 !== expectedSigB64) return null

	// Parse payload
	let payload: unknown
	try {
		const raw = Buffer.from(payloadB64, 'base64url').toString('utf-8')
		payload = JSON.parse(raw)
	} catch {
		return null
	}

	// Validate structure
	if (
		typeof payload !== 'object' ||
		payload === null ||
		typeof payload.orderId !== 'string' ||
		typeof payload.email !== 'string' ||
		typeof payload.exp !== 'number'
	) {
		return null
	}

	// Verify not expired (allow 60s clock skew)
	const now = Math.floor(Date.now() / 1000)
	if (payload.exp < now - 60) return null

	// TypeScript: payload is still `object` after typeof check.
	// Construct an explicitly typed result from the validated fields.
	const result: GuestTokenPayload = {
		orderId: payload.orderId,
		email: payload.email,
		exp: payload.exp,
	}
	return result
}
