import { createHmac, timingSafeEqual } from 'crypto'

const TOKEN_EXPIRY_MINUTES = 60 // Tokens expire after 1 hour

interface TokenPayload {
	orderNumber: string
	email: string
	exp: number // Unix timestamp in seconds
}

/**
 * Encode a buffer as base64url (URL-safe base64 without padding).
 */
function base64urlEncode(buf: Buffer): string {
	return buf.toString('base64url')
}

/**
 * Decode a base64url string to a buffer.
 */
function base64urlDecode(str: string): Buffer {
	return Buffer.from(str, 'base64url')
}

/**
 * Create an HMAC-SHA256 signature of the data using the session secret.
 */
function sign(data: string): Buffer {
	const secret = process.env.SESSION_SECRET
	if (!secret) throw new Error('SESSION_SECRET is not set')
	return createHmac('sha256', secret).update(data).digest()
}

/**
 * Create a signed token for guest order access.
 * Token format: <base64url(json_payload)>.<base64url(hmac_signature)>
 *
 * @param orderNumber - The order number
 * @param email - The guest email address
 * @param expiresInMinutes - Token expiry in minutes (default: 60)
 * @returns The signed token string
 */
export function createGuestOrderToken(
	orderNumber: string,
	email: string,
	expiresInMinutes: number = TOKEN_EXPIRY_MINUTES,
): string {
	const payload: TokenPayload = {
		orderNumber,
		email: email.toLowerCase(),
		exp: Math.floor(Date.now() / 1000) + expiresInMinutes * 60,
	}

	const payloadJson = JSON.stringify(payload)
	const payloadEncoded = base64urlEncode(Buffer.from(payloadJson, 'utf-8'))
	const signature = base64urlEncode(sign(payloadEncoded))

	return `${payloadEncoded}.${signature}`
}

/**
 * Verify a signed guest order token and return the payload if valid.
 * Returns null if the token is invalid, expired, or tampered with.
 *
 * @param token - The signed token string
 * @returns The token payload (orderNumber, email) or null
 */
export function verifyGuestOrderToken(
	token: string,
): { orderNumber: string; email: string } | null {
	try {
		const parts = token.split('.')
		if (parts.length !== 2) return null

		const [payloadEncoded, signatureEncoded] = parts

		// Verify signature using constant-time comparison
		const expectedSignature = sign(payloadEncoded)
		const providedSignature = base64urlDecode(signatureEncoded)

		if (
			expectedSignature.length !== providedSignature.length ||
			!timingSafeEqual(expectedSignature, providedSignature)
		) {
			return null
		}

		// Decode and validate payload
		const payloadJson = base64urlDecode(payloadEncoded).toString('utf-8')
		const payload = JSON.parse(payloadJson) as TokenPayload

		// Validate required fields
		if (
			typeof payload.orderNumber !== 'string' ||
			typeof payload.email !== 'string' ||
			typeof payload.exp !== 'number'
		) {
			return null
		}

		// Check expiry
		if (Date.now() / 1000 > payload.exp) {
			return null
		}

		return {
			orderNumber: payload.orderNumber,
			email: payload.email,
		}
	} catch {
		return null
	}
}
