import { prisma } from '#app/utils/db.server.ts'

/**
 * Execute an operation with dual idempotency guarantees:
 * 1. Local: Prisma transaction-based check-then-insert using IdempotencyRecord
 * 2. Remote: Stripe's native idempotency key (passed through to the SDK)
 *
 * Flow:
 * - Check IdempotencyRecord for an existing key
 * - If "completed" → return cached response (fast path, no Stripe call)
 * - If "processing" → throw IdempotencyConflictError (another request in flight)
 * - If "failed" or no record → create/update "processing" record in a transaction,
 *   execute the operation, then update to "completed" with the response
 * - On error → mark as "failed" so future attempts can retry
 *
 * @param key - Unique idempotency key for this operation
 * @param operationType - Human-readable operation type (e.g., "checkout_session")
 * @param execute - The operation to run idempotently. Receives the key so it can
 *   pass it to Stripe's native idempotency parameter.
 * @returns The result of the operation (cached if already completed)
 */
export async function withIdempotency<T>(
	key: string,
	operationType: string,
	execute: (stripeIdempotencyKey: string) => Promise<T>,
): Promise<T> {
	// Fast path: check for already-completed record
	const existing = await prisma.idempotencyRecord.findUnique({
		where: { idempotencyKey: key },
	})

	if (existing?.status === 'completed') {
		return existing.response as unknown as T
	}

	if (existing?.status === 'processing') {
		throw new IdempotencyConflictError(key)
	}

	// No record, or previous attempt failed — proceed
	try {
		// Use a Prisma transaction for check-then-insert race safety.
		// If two requests arrive simultaneously for the same key,
		// the transaction ensures only one creates the "processing" record.
		const result = await prisma.$transaction(async (tx) => {
			const inside = await tx.idempotencyRecord.findUnique({
				where: { idempotencyKey: key },
			})

			if (inside?.status === 'completed') {
				// Another request completed while we were entering the transaction
				return { cached: true, value: inside.response as unknown as T }
			}

			if (inside?.status === 'processing') {
				throw new IdempotencyConflictError(key)
			}

			// Create (or re-create if previously failed) a "processing" record
			const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h TTL
			await tx.idempotencyRecord.upsert({
				where: { idempotencyKey: key },
				create: {
					idempotencyKey: key,
					operationType,
					status: 'processing',
					expiresAt,
				},
				update: {
					status: 'processing',
					expiresAt,
				},
			})

			return { cached: false, value: undefined as unknown as T }
		})

		if (result.cached) {
			return result.value
		}

		// Execute the actual operation — Stripe's native idempotency
		// handles the remote-side deduplication.
		const response = await execute(key)

		// Store the successful response
		await prisma.idempotencyRecord.update({
			where: { idempotencyKey: key },
			data: {
				status: 'completed',
				response: response as any,
			},
		})

		return response
	} catch (error) {
		if (error instanceof IdempotencyConflictError) {
			throw error
		}

		// Mark as failed so future attempts can retry
		await prisma.idempotencyRecord
			.update({
				where: { idempotencyKey: key },
				data: { status: 'failed' },
			})
			.catch(() => {
				// Record may not exist if the transaction's upsert failed
			})

		throw error
	}
}

/**
 * Thrown when an operation with the same idempotency key is already in progress.
 * Callers should retry after a short delay or return a "try again" response.
 */
export class IdempotencyConflictError extends Error {
	constructor(key: string) {
		super(`Operation with key "${key}" is already in progress`)
		this.name = 'IdempotencyConflictError'
	}
}

/**
 * Generate a stable idempotency key for checkout operations.
 *
 * Uses cart ID + a 1-minute time window to deduplicate rapid retries
 * (e.g., double-form-submission, network retry) while allowing distinct
 * checkout attempts to proceed with different keys.
 *
 * @param cartId - The cart being checked out
 * @returns An idempotency key like "checkout_cart_abc123_29182394"
 */
export function generateCheckoutKey(cartId: string): string {
	const windowMs = 60_000 // 1 minute window
	const window = Math.floor(Date.now() / windowMs)
	return `checkout_${cartId}_${window}`
}
