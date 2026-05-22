import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { data } from 'react-router'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { processWebhook } from '#app/utils/webhook.server.ts'
import { type Route } from './+types/resend.ts'

/**
 * Verify the Resend webhook signature.
 * Resend uses Svix-compatible signature headers for webhook verification.
 *
 * Headers:
 * - svix-id: Unique message ID
 * - svix-timestamp: Unix timestamp of the message
 * - svix-signature: HMAC-SHA256 signature
 *
 * The signature is computed as: HMAC-SHA256(svix-id.svix-timestamp.body, secret)
 */
function verifyResendSignature(
	body: string,
	headers: Headers,
	secret: string,
): boolean {
	const svixId = headers.get('svix-id')
	const svixTimestamp = headers.get('svix-timestamp')
	const svixSignature = headers.get('svix-signature')

	if (!svixId || !svixTimestamp || !svixSignature) {
		return false
	}

	// Verify timestamp is recent (prevent replay attacks, 5-minute tolerance)
	const timestampDiff = Math.abs(
		Math.floor(Date.now() / 1000) - parseInt(svixTimestamp, 10),
	)
	if (timestampDiff > 300) {
		return false
	}

	// Compute expected signature
	const signedContent = `${svixId}.${svixTimestamp}.${body}`
	const expectedSignature = createHmac('sha256', secret)
		.update(signedContent)
		.digest('hex')

	// Split svix-signature (format: "v1,g0hQ..." — space-separated)
	const signatures = svixSignature.split(' ')
	for (const sig of signatures) {
		// Remove version prefix (e.g., "v1,")
		const parts = sig.split(',')
		if (parts.length >= 2) {
			try {
				const sigBytes = Buffer.from(parts[1], 'hex')
				const expectedBytes = Buffer.from(expectedSignature, 'hex')
				if (
					sigBytes.length === expectedBytes.length &&
					timingSafeEqual(sigBytes, expectedBytes)
				) {
					return true
				}
			} catch {
				// Invalid hex, skip this signature
			}
		}
	}

	return false
}

/**
 * Webhook handler for Resend email events.
 * Processes email delivery notifications (sent, delivered, bounced, etc.).
 * Uses WebhookEvent table for idempotent deduplication.
 */
export async function action({ request }: Route.ActionArgs) {
	const body = await request.text()

	invariant(
		process.env.RESEND_WEBHOOK_SECRET,
		'RESEND_WEBHOOK_SECRET must be set in environment variables',
	)

	// Verify webhook signature
	if (!verifyResendSignature(body, request.headers, process.env.RESEND_WEBHOOK_SECRET)) {
		Sentry.captureMessage('Invalid Resend webhook signature', {
			level: 'warning',
			tags: { context: 'webhook-signature-verification', provider: 'resend' },
		})
		return data({ error: 'Invalid webhook signature' }, { status: 401 })
	}

	let payload: { type?: string; data?: Record<string, unknown> }
	try {
		payload = JSON.parse(body)
	} catch (err) {
		return data({ error: 'Invalid JSON body' }, { status: 400 })
	}

	const eventType = payload.type || 'unknown'
	const eventId = request.headers.get('svix-id') || `resend_${Date.now()}_${Math.random().toString(36).slice(2)}`

	// Process with idempotent deduplication via WebhookEvent table
	const result = await processWebhook(
		eventId,
		eventType,
		'resend',
		payload,
		async () => {
			// Record email delivery events for observability
			// The handler body is intentionally minimal — most Resend events
			// are informational (delivered, opened, clicked, bounced, etc.)
			switch (eventType) {
				case 'email.bounced':
				case 'email.complained': {
					void Sentry.captureMessage(
						`Resend ${eventType}: email to ${(payload.data as any)?.email || 'unknown'}`,
						{
							level: 'warning',
							tags: { context: 'webhook-email-event', provider: 'resend', eventType },
							extra: payload.data as Record<string, unknown>,
						},
					)
					break
				}
				default: {
					// Informational events — logged for audit trail only
					break
				}
			}
		},
	)

	if (result.status === 'PROCESSED') {
		return data({ received: true, idempotent: !result.processed })
	}

	if (result.status === 'FAILED') {
		return data(
			{ received: true, error: 'Webhook processing failed', message: result.error },
			{ status: 500 },
		)
	}

	return data({ received: true })
}
