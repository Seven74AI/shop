import { prisma } from '#app/utils/db.server.ts'
import * as Sentry from '@sentry/react-router'

/**
 * Handler function type for processing webhook payloads.
 * Receives the parsed payload and performs the actual business logic.
 */
export type WebhookHandler = (payload: unknown) => Promise<void>

/**
 * Result of processing a webhook event.
 */
export type ProcessWebhookResult = {
	/** Current status of the webhook event */
	status: string
	/** Whether this invocation performed the actual processing */
	processed: boolean
	/** Error message if processing failed */
	error?: string
	/** Error constructor name (e.g. 'StockUnavailableError') — allows callers to distinguish permanent vs transient failures */
	errorType?: string
}

/**
 * Process a webhook event with idempotent deduplication.
 *
 * Uses the WebhookEvent table's @unique constraint on eventId as the
 * idempotency gate. If an event with the same eventId has already been
 * PROCESSED, the handler is skipped and the cached result is returned.
 * Failed events are retried (handler re-executed) until they succeed.
 *
 * @param eventId - Provider-side event ID (idempotency key), e.g. "evt_1ABC..."
 * @param eventType - Event type, e.g. "checkout.session.completed"
 * @param provider - Provider name, e.g. "stripe" or "resend"
 * @param payload - Full webhook payload from the provider
 * @param handler - Async function that processes the payload
 * @returns Result indicating whether processing happened
 */
export async function processWebhook(
	eventId: string,
	eventType: string,
	provider: string,
	payload: unknown,
	handler: WebhookHandler,
): Promise<ProcessWebhookResult> {
	// Fast path: check if already PROCESSED
	const existing = await prisma.webhookEvent.findUnique({
		where: { eventId },
	})

	if (existing?.status === 'PROCESSED') {
		return { status: 'PROCESSED', processed: false }
	}

	// Upsert to ensure a record exists (race-safe via @unique on eventId).
	// This covers:
	// - First event: creates a RECEIVED record
	// - Duplicate concurrent: no-op (record already exists)
	// - Failed retry: record already exists, carry on
	await prisma.webhookEvent.upsert({
		where: { eventId },
		create: {
			eventId,
			eventType,
			provider,
			payload: payload as any,
			status: 'RECEIVED',
			attempts: 0,
		},
		update: {}, // No-op if the record already exists
	})

	// Mark as PROCESSING and increment attempts atomically.
	// Conditional update: only transition from RECEIVED or FAILED statuses
	// to prevent concurrent handler execution on the same eventId.
	let event
	try {
		event = await prisma.webhookEvent.update({
			where: { eventId, status: { in: ['RECEIVED', 'FAILED'] } },
			data: {
				status: 'PROCESSING',
				attempts: { increment: 1 },
			},
		})
	} catch {
		// Record already PROCESSING or PROCESSED by a concurrent handler —
		// re-read and return the current state
		const current = await prisma.webhookEvent.findUniqueOrThrow({
			where: { eventId },
		})
		return {
			status: current.status,
			processed: false,
		}
	}

	// Execute the handler
	try {
		await handler(payload)

		await prisma.webhookEvent.update({
			where: { eventId },
			data: {
				status: 'PROCESSED',
				processedAt: new Date(),
			},
		})

		return { status: 'PROCESSED', processed: true }
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error'
		const errorType =
			error instanceof Error ? (error.name || error.constructor.name) : undefined

		await prisma.webhookEvent.update({
			where: { eventId },
			data: {
				status: 'FAILED',
				lastError: errorMessage,
			},
		})

		Sentry.captureException(error, {
			tags: { context: 'webhook-processing', provider },
			extra: { eventId, eventType },
		})

		return {
			status: 'FAILED',
			processed: false,
			error: errorMessage,
			errorType,
		}
	}
}
