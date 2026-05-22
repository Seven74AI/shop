import { prisma } from './db.server.ts'

/**
 * Lockout policy configuration.
 * Tiered by attempt count — lock duration increases with more failures.
 */
const LOCKOUT_TIERS = [
	{ minAttempts: 15, lockDurationMs: 60 * 60 * 1000 }, // 1 hour
	{ minAttempts: 10, lockDurationMs: 30 * 60 * 1000 }, // 30 min
	{ minAttempts: 5, lockDurationMs: 5 * 60 * 1000 }, // 5 min
] as const

export type LockoutStatus = {
	locked: boolean
	attempts: number
	retryAfterMs: number
}

/**
 * Check whether a user is currently locked out because of too many failed
 * login attempts. Returns the current attempt count and, if locked, the
 * remaining retry-after duration in milliseconds.
 */
export async function checkLockout(userId: string): Promise<LockoutStatus> {
	const failedAttempts = await prisma.loginAttempt.findMany({
		where: { userId, success: false },
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true },
		take: LOCKOUT_TIERS[0].minAttempts, // we never need more than the max tier
	})

	const count = failedAttempts.length

	// Below the lowest threshold — never locked.
	if (count < LOCKOUT_TIERS.at(-1)!.minAttempts) {
		return { locked: false, attempts: count, retryAfterMs: 0 }
	}

	// Determine which tier applies.
	const applicableTier = LOCKOUT_TIERS.find((t) => count >= t.minAttempts)!
	const lockDurationMs = applicableTier.lockDurationMs

	// Lockout is measured from the *most recent* failed attempt.
	const lastAttempt = failedAttempts[0]
	const lockExpiresAt = new Date(
		lastAttempt.createdAt.getTime() + lockDurationMs,
	)
	const retryAfterMs = lockExpiresAt.getTime() - Date.now()

	if (retryAfterMs <= 0) {
		return { locked: false, attempts: count, retryAfterMs: 0 }
	}

	return { locked: true, attempts: count, retryAfterMs }
}

/**
 * Record a failed login attempt for a user. Extracts IP address and User-Agent
 * from the request for audit purposes.
 */
export async function recordFailedAttempt(
	userId: string,
	request: Request,
): Promise<void> {
	const userAgent = request.headers.get('user-agent') ?? undefined
	const ipAddress =
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		undefined

	await prisma.loginAttempt.create({
		data: {
			userId,
			ipAddress,
			userAgent,
			success: false,
			failureReason: 'Invalid username or password',
		},
	})
}

/**
 * Reset the lockout counter for a user — typically called after a successful
 * login. Deletes ALL login attempts (successful and failed) to fully reset
 * the counter.
 */
export async function resetAttempts(userId: string): Promise<void> {
	await prisma.loginAttempt.deleteMany({
		where: { userId },
	})
}
