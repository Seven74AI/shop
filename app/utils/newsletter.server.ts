import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'

const TOKEN_BYTES = 32
const TOKEN_EXPIRY_DAYS = 7

/**
 * Generate a cryptographically random token for newsletter confirmation.
 * Token format: hex string of random bytes + "." + HMAC signature.
 * The HMAC signature prevents token forgery without needing a DB lookup
 * for every request (we still validate against the DB for state management).
 */
function generateToken(): string {
	const raw = randomBytes(TOKEN_BYTES).toString('hex')
	const signature = signToken(raw)
	return `${raw}.${signature}`
}

/**
 * Sign a token payload with HMAC-SHA256 using HONEYPOT_SECRET as the key.
 */
function signToken(payload: string): string {
	const secret = process.env.HONEYPOT_SECRET
	if (!secret) {
		throw new Error('HONEYPOT_SECRET is required for token generation')
	}
	return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Verify a token's HMAC signature. Returns the raw token bytes if valid, null otherwise.
 */
function verifyToken(token: string): string | null {
	const parts = token.split('.')
	if (parts.length !== 2) return null

	const [raw, signature] = parts as [string, string]
	const expectedSignature = signToken(raw)

	try {
		const sigBuf = Buffer.from(signature, 'hex')
		const expectedBuf = Buffer.from(expectedSignature, 'hex')
		if (sigBuf.length !== expectedBuf.length) return null
		if (timingSafeEqual(sigBuf, expectedBuf)) return raw
		return null
	} catch {
		return null
	}
}

/**
 * Hash a token for database storage. We store the raw token bytes' hash,
 * not the full token, so even if the DB is compromised, tokens can't be
 * replayed without the HMAC secret.
 */
function hashTokenForStorage(raw: string): string {
	const secret = process.env.HONEYPOT_SECRET
	if (!secret) {
		throw new Error('HONEYPOT_SECRET is required for token hashing')
	}
	return createHmac('sha256', secret).update(`newsletter:${raw}`).digest('hex')
}

/**
 * Create a newsletter subscription (pending confirmation).
 * Returns the subscription and the full confirmation token.
 * The full token is only returned here — it's never stored.
 */
export async function createSubscription(email: string) {
	const normalizedEmail = email.toLowerCase().trim()

	// Check if already subscribed or pending
	const existing = await prisma.newsletterSubscription.findUnique({
		where: { email: normalizedEmail },
	})

	if (existing) {
		if (existing.status === 'CONFIRMED') {
			return { created: false as const, reason: 'already_subscribed' as const }
		}
		if (existing.status === 'PENDING') {
			// Re-send confirmation? For now, just report as pending.
			return { created: false as const, reason: 'already_pending' as const }
		}
		// UNSUBSCRIBED — allow re-subscription
	}

	const fullToken = generateToken()
	const rawToken = fullToken.split('.')[0]!
	const hashedToken = hashTokenForStorage(rawToken)

	const tokenExpiresAt = new Date()
	tokenExpiresAt.setDate(tokenExpiresAt.getDate() + TOKEN_EXPIRY_DAYS)

	const subscription = await prisma.newsletterSubscription.upsert({
		where: { email: normalizedEmail },
		create: {
			email: normalizedEmail,
			status: 'PENDING',
			token: hashedToken,
			tokenExpiresAt,
		},
		update: {
			status: 'PENDING',
			token: hashedToken,
			tokenExpiresAt,
			confirmedAt: null,
			unsubscribedAt: null,
		},
	})

	return {
		created: true as const,
		subscription,
		confirmationToken: fullToken, // Only returned here, never persisted
	}
}

/**
 * Confirm a newsletter subscription using the token from the confirmation email.
 * Returns the subscription if confirmed, or an error reason.
 */
export async function confirmSubscription(fullToken: string) {
	const rawToken = verifyToken(fullToken)
	if (!rawToken) {
		return { success: false as const, reason: 'invalid_token' as const }
	}

	const hashedToken = hashTokenForStorage(rawToken)

	const subscription = await prisma.newsletterSubscription.findUnique({
		where: { token: hashedToken },
	})

	if (!subscription) {
		return { success: false as const, reason: 'not_found' as const }
	}

	if (subscription.status === 'CONFIRMED') {
		return { success: true as const, subscription, alreadyConfirmed: true }
	}

	if (subscription.status === 'UNSUBSCRIBED') {
		return { success: false as const, reason: 'unsubscribed' as const }
	}

	// Check expiry (tokenExpiresAt is nullable — null means no valid token)
	if (!subscription.tokenExpiresAt || new Date() > subscription.tokenExpiresAt) {
		return { success: false as const, reason: 'expired' as const }
	}

	const updated = await prisma.newsletterSubscription.update({
		where: { id: subscription.id },
		data: {
			status: 'CONFIRMED',
			confirmedAt: new Date(),
			token: null, // Clear the token after confirmation
			tokenExpiresAt: null,
		},
	})

	return { success: true as const, subscription: updated }
}

/**
 * Unsubscribe from the newsletter using a token.
 * The unsubscribe token is the same confirmation token.
 */
export async function unsubscribeFromNewsletter(fullToken: string) {
	const rawToken = verifyToken(fullToken)
	if (!rawToken) {
		return { success: false as const, reason: 'invalid_token' as const }
	}

	const hashedToken = hashTokenForStorage(rawToken)

	const subscription = await prisma.newsletterSubscription.findUnique({
		where: { token: hashedToken },
	})

	if (!subscription) {
		return { success: false as const, reason: 'not_found' as const }
	}

	if (subscription.status === 'UNSUBSCRIBED') {
		return { success: false as const, reason: 'already_unsubscribed' as const }
	}

	const updated = await prisma.newsletterSubscription.update({
		where: { id: subscription.id },
		data: {
			status: 'UNSUBSCRIBED',
			unsubscribedAt: new Date(),
			token: null,
			tokenExpiresAt: null,
		},
	})

	return { success: true as const, subscription: updated }
}

/**
 * Get a newsletter subscription by email.
 */
export async function getSubscription(email: string) {
	return prisma.newsletterSubscription.findUnique({
		where: { email: email.toLowerCase().trim() },
	})
}
