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
	let rawPayload: unknown
	try {
		const raw = Buffer.from(payloadB64, 'base64url').toString('utf-8')
		rawPayload = JSON.parse(raw)
	} catch {
		return null
	}

	// Validate structure with type guard
	const payload = asGuestTokenPayload(rawPayload)
	if (!payload) return null

	// Verify not expired (allow 60s clock skew)
	const now = Math.floor(Date.now() / 1000)
	if (payload.exp < now - 60) return null

	return payload
}

function asGuestTokenPayload(obj: unknown): GuestTokenPayload | null {
	if (typeof obj !== 'object' || obj === null) return null
	const rec = obj as Record<string, unknown>
	if (typeof rec.orderId !== 'string') return null
	if (typeof rec.email !== 'string') return null
	if (typeof rec.exp !== 'number') return null
	return { orderId: rec.orderId, email: rec.email, exp: rec.exp }
}
