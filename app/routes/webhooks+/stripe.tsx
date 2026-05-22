import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { data } from 'react-router'
import type Stripe from 'stripe'
import { fulfillOrder } from '#app/utils/fulfillment.server.ts'
import { StockUnavailableError } from '#app/utils/order-stock.server.ts'
import { createOrderFromStripeSession } from '#app/utils/order.server.ts'
import { type StoreAddress } from '#app/utils/shipment.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { processWebhook } from '#app/utils/webhook.server.ts'
import { type Route } from './+types/stripe.ts'

/**
 * Webhook handler for Stripe events.
 * Handles checkout.session.completed events to create orders.
 * Uses WebhookEvent table for idempotent deduplication.
 */
export async function action({ request }: Route.ActionArgs) {
	const body = await request.text()
	const sig = request.headers.get('stripe-signature')

	invariant(sig, 'Missing webhook signature')
	invariant(
		process.env.STRIPE_WEBHOOK_SECRET,
		'STRIPE_WEBHOOK_SECRET must be set in environment variables',
	)

	let event: Stripe.Event
	try {
		event = stripe.webhooks.constructEvent(
			body,
			sig,
			process.env.STRIPE_WEBHOOK_SECRET,
			300, // tolerance in seconds
		)
	} catch (err) {
		// Log signature verification failures to Sentry
		Sentry.captureException(err, {
			tags: { context: 'webhook-signature-verification' },
		})
		return data(
			{ error: `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}` },
			{ status: 400 },
		)
	}

	// Handle checkout.session.completed event
	if (event.type === 'checkout.session.completed') {
		const session = event.data.object as Stripe.Checkout.Session

		// Retrieve full session from Stripe with expanded data
		const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
			expand: ['line_items', 'payment_intent'],
		})

		// Verify payment status before proceeding to idempotent processing
		if (fullSession.payment_status !== 'paid') {
			void Sentry.captureMessage(
				`Payment not completed for session ${session.id}. Payment status: ${fullSession.payment_status}`,
				{
					level: 'warning',
					tags: { context: 'webhook-payment-status' },
					extra: { sessionId: session.id, paymentStatus: fullSession.payment_status },
				},
			)
			return data(
				{
					received: true,
					skipped: true,
					message: `Payment not completed. Status: ${fullSession.payment_status}`,
				},
				{ status: 200 },
			)
		}

		// Process with idempotent deduplication via WebhookEvent table
		const result = await processWebhook(
			event.id,
			event.type,
			'stripe',
			{ sessionId: session.id, paymentIntent: typeof fullSession.payment_intent === 'string' ? fullSession.payment_intent : fullSession.payment_intent?.id },
			async () => {
				// Create order
				const order = await createOrderFromStripeSession(
					session.id,
					fullSession,
					request,
				)

				// Fulfill order (create shipments, etc.) - non-blocking
				// Don't fail webhook if fulfillment fails - it can be retried manually
				try {
					const storeAddress: StoreAddress = {
						name: process.env.STORE_NAME || 'Store',
						address1: process.env.STORE_ADDRESS1 || '',
						address2: process.env.STORE_ADDRESS2,
						city: process.env.STORE_CITY || '',
						postalCode: process.env.STORE_POSTAL_CODE || '',
						country: process.env.STORE_COUNTRY || 'FR',
						phone: process.env.STORE_PHONE || '',
						email: process.env.STORE_EMAIL,
					}

					await fulfillOrder(order.id, storeAddress)
				} catch (fulfillmentError) {
					// Log fulfillment errors but don't fail webhook
					// Order was created successfully, fulfillment can be retried
					Sentry.captureException(fulfillmentError, {
						tags: { context: 'webhook-order-fulfillment' },
						extra: {
							orderId: order.id,
							sessionId: session.id,
						},
					})
				}
			},
		)

		if (result.status === 'PROCESSED') {
			return data({ received: true, idempotent: !result.processed })
		}

		// Handle FAILED status — only refund for permanent errors (stock unavailable).
		// Transient errors (DB timeout, network) return 500 without refund so Stripe
		// retries; processWebhook re-processes FAILED events automatically.
		if (result.status === 'FAILED' && result.error) {
			const isStockError = result.errorType === 'StockUnavailableError'

			if (isStockError) {
				// Stock unavailable after payment — permanent failure, must refund
				const paymentIntentId =
					typeof fullSession.payment_intent === 'string'
						? fullSession.payment_intent
						: fullSession.payment_intent?.id

				if (paymentIntentId && fullSession.amount_total) {
					// Extract product name from error message for metadata
					const productNameMatch = result.error?.match(/Insufficient stock for (.+)$/)
					const productName = productNameMatch ? productNameMatch[1] : undefined

					try {
						await stripe.refunds.create({
							payment_intent: paymentIntentId,
							amount: fullSession.amount_total,
							reason: 'requested_by_customer',
							metadata: {
								reason: 'stock_unavailable',
								checkout_session_id: fullSession.id,
								product_name: productName ?? null,
							},
						})
						Sentry.captureMessage(
							`Refund created for payment ${paymentIntentId} due to stock unavailability`,
							{
								level: 'info',
								tags: { context: 'webhook-refund' },
								extra: { paymentIntentId, sessionId: fullSession.id },
							},
						)
					} catch (refundError) {
						Sentry.captureException(refundError, {
							tags: { context: 'webhook-refund-error' },
							extra: { paymentIntentId, sessionId: fullSession.id },
						})
					}
				}

				return data(
					{
						received: true,
						error: 'Stock unavailable',
						message: result.error,
					},
					{ status: 500 },
				)
			}

			// Transient error (DB timeout, network, etc.) — return 500 without refunding.
			// Stripe will retry; processWebhook re-processes the FAILED event on retry.
			return data(
				{
					received: true,
					error: 'Webhook processing failed',
					message: result.error,
				},
				{ status: 500 },
			)
		}

		return data({ received: true })
	}

	// Return success for unhandled event types
	return data({ received: true })
}
