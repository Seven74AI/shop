import { http, HttpResponse, passthrough } from 'msw'
import Stripe from 'stripe'

/**
 * In-memory store for tracking idempotency keys.
 * Simulates Stripe's idempotency behavior — returns the same response
 * for duplicate keys within the test session.
 */
const idempotencyStore = new Map<string, { status: number; body: any }>()

/**
 * Mock Stripe Checkout Session response
 */
function createMockCheckoutSession(
	params: {
		sessionId?: string
		url?: string
		paymentStatus?: Stripe.Checkout.Session['payment_status']
		amountTotal?: number
		currency?: string
		lineItems?: Array<{
			price_data?: {
				currency: string
				product_data: { name: string; description?: string }
				unit_amount: number
			}
			quantity: number
		}>
		metadata?: Record<string, string>
	} = {},
): Stripe.Checkout.Session {
	const sessionId = params.sessionId || `cs_test_${Date.now()}`
	const checkoutUrl = params.url || `https://checkout.stripe.com/c/pay/${sessionId}`

	return {
		id: sessionId,
		object: 'checkout.session',
		after_expiration: null,
		allow_promotion_codes: null,
		amount_subtotal: params.amountTotal || 0,
		amount_total: params.amountTotal || 0,
		automatic_tax: { enabled: false, status: null },
		billing_address_collection: null,
		cancel_url: 'http://localhost:3000/shop/checkout?canceled=true',
		client_reference_id: null,
		client_secret: null,
		consent: null,
		consent_collection: null,
		created: Math.floor(Date.now() / 1000),
		currency: params.currency || 'usd',
		currency_conversion: null,
		custom_fields: [],
		custom_text: {
			after_submit: null,
			shipping_address: null,
			submit: null,
			terms_of_service_acceptance: null,
		},
		customer: null,
		customer_creation: null,
		customer_details: {
			address: null,
			email: null,
			name: null,
			phone: null,
			tax_exempt: null,
			tax_ids: [],
		},
		customer_email: null,
		expires_at: null,
		invoice: null,
		invoice_creation: null,
		livemode: false,
		locale: null,
		mode: 'payment',
		payment_intent: null,
		payment_link: null,
		payment_method_collection: 'if_required',
		payment_method_configuration_details: null,
		payment_method_options: {},
		payment_method_types: ['card'],
		payment_status: params.paymentStatus || 'unpaid',
		phone_number_collection: { enabled: false },
		recovered_from: null,
		saved_payment_method_options: null,
		shipping_address_collection: null,
		shipping_cost: null,
		shipping_details: null,
		shipping_options: [],
		status: 'open',
		submit_type: null,
		subscription: null,
		success_url: 'http://localhost:3000/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}',
		total_details: {
			amount_discount: 0,
			amount_shipping: 0,
			amount_tax: 0,
		},
		ui_mode: 'hosted',
		url: checkoutUrl,
		line_items: {
			object: 'list',
			data: [],
			has_more: false,
			url: `/v1/checkout/sessions/${sessionId}/line_items`,
		},
		metadata: params.metadata || {},
	} as unknown as Stripe.Checkout.Session
}

/**
 * MSW handlers for Stripe API requests
 * In test mode: mock Stripe API responses
 * In development: passthrough to real Stripe API
 */
export const handlers = [
	// In test mode, mock Stripe API endpoints
	...(process.env.NODE_ENV === 'test'
		? [
				// POST /v1/checkout/sessions - Create checkout session
				http.post('https://api.stripe.com/v1/checkout/sessions', async ({ request }) => {
					// Check for idempotency key header
					const idempotencyKey = request.headers.get('Idempotency-Key')
					if (idempotencyKey) {
						const stored = idempotencyStore.get(idempotencyKey)
						if (stored) {
							// Return the same response for duplicate idempotency keys
							return HttpResponse.json(stored.body, { status: stored.status })
						}
					}

					const body = await request.text()
					const params = new URLSearchParams(body)
					
					// Extract metadata if present
					const metadata: Record<string, string> = {}
					for (const [key, value] of params.entries()) {
						if (key.startsWith('metadata[') && key.endsWith(']')) {
							const metaKey = key.slice(9, -1)
							metadata[metaKey] = value
						}
					}

					const sessionId = `cs_test_${Date.now()}`
					const checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}`

					const session = createMockCheckoutSession({
						sessionId,
						url: checkoutUrl,
						paymentStatus: 'unpaid',
						currency: 'usd',
						metadata,
					})

					// Store response for idempotency key
					if (idempotencyKey) {
						idempotencyStore.set(idempotencyKey, {
							status: 200,
							body: session,
						})
					}

					return HttpResponse.json(session, { status: 200 })
				}),

				// GET /v1/checkout/sessions/:id - Retrieve checkout session
				http.get(
					'https://api.stripe.com/v1/checkout/sessions/:sessionId',
					async ({ params }) => {
						const { sessionId } = params

						// For test sessions, return mock data
						if (typeof sessionId === 'string' && sessionId.startsWith('cs_test_')) {
							const session = createMockCheckoutSession({
								sessionId,
								paymentStatus: 'paid',
								amountTotal: 10000, // $100.00 in cents
								currency: 'usd',
							})

							return HttpResponse.json(session, { status: 200 })
						}

						// For other sessions, return 404
						return HttpResponse.json(
							{
								error: {
									type: 'invalid_request_error',
									message: `No such checkout session: ${sessionId}`,
								},
							},
							{ status: 404 },
						)
					},
				),

				// Webhook signature verification endpoint (for testing webhooks)
				// Note: Actual webhook verification uses stripe.webhooks.constructEvent()
				// which we'll test using Stripe's generateTestHeaderString()

				// POST /v1/refunds - Create a refund
				http.post('https://api.stripe.com/v1/refunds', async ({ request }) => {
					// Check for idempotency key header
					const idempotencyKey = request.headers.get('Idempotency-Key')
					if (idempotencyKey) {
						const stored = idempotencyStore.get(idempotencyKey)
						if (stored) {
							return HttpResponse.json(stored.body, { status: stored.status })
						}
					}

					const refundId = `re_test_${Date.now()}`
					const refund = {
						id: refundId,
						object: 'refund',
						amount: 10000,
						currency: 'usd',
						status: 'succeeded',
					}

					if (idempotencyKey) {
						idempotencyStore.set(idempotencyKey, {
							status: 200,
							body: refund,
						})
					}

					return HttpResponse.json(refund, { status: 200 })
				}),

				// GET /v1/payment_intents/:id - Retrieve payment intent
				http.get(
					'https://api.stripe.com/v1/payment_intents/:paymentIntentId',
					async ({ params }) => {
						const { paymentIntentId } = params

						return HttpResponse.json({
							id: paymentIntentId,
							object: 'payment_intent',
							amount: 10000,
							currency: 'usd',
							status: 'succeeded',
							latest_charge: `ch_test_${Date.now()}`,
						}, { status: 200 })
					},
				),
			]
		: [
				// In development mode, passthrough all Stripe API requests
				http.all(/^https:\/\/api\.stripe\.com\/.*/, () => {
					return passthrough()
				}),
				http.all(/^https:\/\/checkout\.stripe\.com\/.*/, () => {
					return passthrough()
				}),
			]),
]

/**
 * Generate test webhook signature for Stripe webhook testing
 * Uses Stripe's built-in method for generating test signatures
 */
export function generateTestWebhookSignature(
	payload: string | object,
	secret: string,
): string {
	const stripe = new Stripe(secret, {
		apiVersion: '2026-04-22.dahlia',
	})
	
	const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload)
	
	return stripe.webhooks.generateTestHeaderString({
		payload: payloadString,
		secret,
	})
}
