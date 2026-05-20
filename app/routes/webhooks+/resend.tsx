import { createHmac, timingSafeEqual } from 'node:crypto'
import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { data } from 'react-router'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/resend.ts'

// --- Resend webhook signature verification ---
// Resend uses Svix-compatible webhook signatures.
// The signature is HMAC-SHA256 of svix-id.svix-timestamp.body

function verifySignature(
	body: string,
	headers: {
		'svix-id': string | null
		'svix-timestamp': string | null
		'svix-signature': string | null
	},
	secret: string,
): boolean {
	const { 'svix-id': id, 'svix-timestamp': timestamp } = headers
	let { 'svix-signature': sigHeader } = headers

	if (!id || !timestamp || !sigHeader) return false

	// Remove v1, prefix if present (Svix uses "v1,<hash>")
	if (sigHeader.startsWith('v1,')) {
		sigHeader = sigHeader.slice(3)
	}

	const signedPayload = `${id}.${timestamp}.${body}`
	const expected = createHmac('sha256', secret).update(signedPayload).digest()

	const provided = Buffer.from(sigHeader, 'hex')
	if (provided.length !== expected.length) return false

	return timingSafeEqual(provided, expected)
}

// --- Resend event types ---

const resendBouncedSchema = z.object({
	type: z.literal('email.bounced'),
	data: z.object({
		created_at: z.string(),
		email_id: z.string().uuid(),
		from: z.string().email(),
		to: z.array(z.string().email()),
		subject: z.string(),
	}),
})

const resendComplainedSchema = z.object({
	type: z.literal('email.complained'),
	data: z.object({
		created_at: z.string(),
		email_id: z.string().uuid(),
		from: z.string().email(),
		to: z.array(z.string().email()),
		subject: z.string(),
	}),
})

const resendEventSchema = z.discriminatedUnion('type', [
	resendBouncedSchema,
	resendComplainedSchema,
])

type ResendEvent = z.infer<typeof resendEventSchema>

/**
 * Webhook handler for Resend events (bounce + complaint).
 * POST /webhooks/resend
 *
 * Handles:
 * - email.bounced (hard bounce → emailNotificationsEnabled = false)
 * - email.complained (spam complaint → marketingEmailsEnabled = false)
 */
export async function action({ request }: Route.ActionArgs) {
	invariant(
		process.env.RESEND_WEBHOOK_SECRET,
		'RESEND_WEBHOOK_SECRET must be set',
	)

	const body = await request.text()
	const svixId = request.headers.get('svix-id')
	const svixTimestamp = request.headers.get('svix-timestamp')
	const svixSignature = request.headers.get('svix-signature')

	// Verify signature
	if (
		!verifySignature(
			body,
			{
				'svix-id': svixId,
				'svix-timestamp': svixTimestamp,
				'svix-signature': svixSignature,
			},
			process.env.RESEND_WEBHOOK_SECRET,
		)
	) {
		Sentry.captureMessage('Resend webhook signature verification failed', {
			level: 'warning',
			tags: { context: 'resend-webhook-signature' },
			extra: { svixId, svixTimestamp },
		})
		return data({ error: 'Invalid signature' }, { status: 401 })
	}

	// Parse the event body
	let rawEvent: unknown
	try {
		rawEvent = JSON.parse(body)
	} catch {
		return data({ error: 'Invalid JSON' }, { status: 400 })
	}

	const parseResult = resendEventSchema.safeParse(rawEvent)
	if (!parseResult.success) {
		// Unknown event type — acknowledge to avoid Resend retries
		console.info('Unhandled Resend event type, skipping:', rawEvent)
		return data({ received: true })
	}

	const event: ResendEvent = parseResult.data

	try {
		switch (event.type) {
			case 'email.bounced': {
				const bouncedTo = event.data.to
				for (const email of bouncedTo) {
					await prisma.user.updateMany({
						where: { email },
						data: { emailNotificationsEnabled: false },
					})
				}
				Sentry.addBreadcrumb({
					message: `Resend bounce processed for ${bouncedTo.join(', ')}`,
					category: 'email',
					level: 'info',
				})
				break
			}
			case 'email.complained': {
				const complainedTo = event.data.to
				for (const email of complainedTo) {
					await prisma.user.updateMany({
						where: { email },
						data: { marketingEmailsEnabled: false },
					})
				}
				Sentry.addBreadcrumb({
					message: `Resend complaint processed for ${complainedTo.join(', ')}`,
					category: 'email',
					level: 'info',
				})
				break
			}
		}
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'resend-webhook-processing' },
			extra: {
				eventType: event.type,
				recipients: event.data.to,
			},
		})
		return data({ error: 'Processing failed' }, { status: 500 })
	}

	return data({ received: true })
}
