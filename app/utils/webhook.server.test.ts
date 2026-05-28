import { test, expect } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	processWebhook,
	type WebhookHandler,
	type ProcessWebhookResult,
} from '#app/utils/webhook.server.ts'

test.describe('processWebhook', () => {
	test('processes a webhook event successfully', async () => {
		const eventId = `evt_success_${Date.now()}`
		let handlerCalled = false
		const handler: WebhookHandler = async (payload) => {
			handlerCalled = true
			expect(payload).toEqual({ type: 'checkout.session.completed', data: { id: 'cs_123' } })
		}

		const result = await processWebhook(
			eventId,
			'checkout.session.completed',
			'stripe',
			{ type: 'checkout.session.completed', data: { id: 'cs_123' } },
			handler,
		)

		expect(result.processed).toBe(true)
		expect(result.status).toBe('PROCESSED')
		expect(handlerCalled).toBe(true)

		// Verify the record in DB
		const record = await prisma.webhookEvent.findUnique({
			where: { eventId },
		})
		expect(record).toBeTruthy()
		expect(record!.status).toBe('PROCESSED')
		expect(record!.eventType).toBe('checkout.session.completed')
		expect(record!.provider).toBe('stripe')
		expect(record!.payload).toEqual({ type: 'checkout.session.completed', data: { id: 'cs_123' } })
		expect(record!.attempts).toBe(1)
		expect(record!.processedAt).toBeTruthy()
		expect(record!.lastError).toBeNull()

		// Cleanup
		await prisma.webhookEvent.delete({ where: { eventId } })
	})

	test('skips duplicate webhook with same eventId (idempotency)', async () => {
		const eventId = `evt_duplicate_${Date.now()}`
		let callCount = 0
		const handler: WebhookHandler = async () => {
			callCount++
		}

		// First call — processes
		const result1 = await processWebhook(
			eventId,
			'order.created',
			'stripe',
			{ orderId: 'ord_123' },
			handler,
		)
		expect(result1.processed).toBe(true)
		expect(result1.status).toBe('PROCESSED')
		expect(callCount).toBe(1)

		// Second call — skips (idempotent)
		const result2 = await processWebhook(
			eventId,
			'order.created',
			'stripe',
			{ orderId: 'ord_123' },
			handler,
		)
		expect(result2.processed).toBe(false)
		expect(result2.status).toBe('PROCESSED')
		expect(callCount).toBe(1) // Handler was NOT called again

		// Verify only one record
		const count = await prisma.webhookEvent.count({ where: { eventId } })
		expect(count).toBe(1)

		// Cleanup
		await prisma.webhookEvent.delete({ where: { eventId } })
	})

	test('records failed webhook and allows retry', async () => {
		const eventId = `evt_fail_retry_${Date.now()}`

		// First attempt — fails
		const handlerFail: WebhookHandler = async () => {
			throw new Error('Database connection lost')
		}

		const result1 = await processWebhook(
			eventId,
			'email.sent',
			'resend',
			{ emailId: 'em_456' },
			handlerFail,
		)
		expect(result1.processed).toBe(false)
		expect(result1.status).toBe('FAILED')
		expect(result1.error).toBe('Database connection lost')

		// Verify record is FAILED
		let record = await prisma.webhookEvent.findUnique({
			where: { eventId },
		})
		expect(record!.status).toBe('FAILED')
		expect(record!.lastError).toBe('Database connection lost')
		expect(record!.attempts).toBe(1)

		// Second attempt — succeeds (retry)
		let handlerCalled = false
		const handlerSuccess: WebhookHandler = async () => {
			handlerCalled = true
		}

		const result2 = await processWebhook(
			eventId,
			'email.sent',
			'resend',
			{ emailId: 'em_456' },
			handlerSuccess,
		)
		expect(result2.processed).toBe(true)
		expect(result2.status).toBe('PROCESSED')
		expect(handlerCalled).toBe(true)

		// Verify record is now PROCESSED
		record = await prisma.webhookEvent.findUnique({
			where: { eventId },
		})
		expect(record!.status).toBe('PROCESSED')
		expect(record!.attempts).toBe(2) // incremented on retry
		expect(record!.processedAt).toBeTruthy()

		// Cleanup
		await prisma.webhookEvent.delete({ where: { eventId } })
	})

	test('increments attempts counter on each processing attempt', async () => {
		const eventId = `evt_attempts_${Date.now()}`

		// Fail twice
		for (let i = 0; i < 2; i++) {
			const handler: WebhookHandler = async () => {
				throw new Error(`Attempt ${i + 1} failed`)
			}
			await processWebhook(
				eventId,
				'test.event',
				'stripe',
				{ test: true },
				handler,
			)
		}

		const record = await prisma.webhookEvent.findUnique({
			where: { eventId },
		})
		expect(record!.attempts).toBe(2)
		expect(record!.status).toBe('FAILED')
		expect(record!.lastError).toBe('Attempt 2 failed')

		// Cleanup
		await prisma.webhookEvent.delete({ where: { eventId } })
	})

	test('handles different providers independently', async () => {
		const stripeId = `evt_stripe_${Date.now()}`
		const resendId = `evt_resend_${Date.now()}`

		const handler: WebhookHandler = async () => {}

		await processWebhook(stripeId, 'payment.success', 'stripe', { amount: 100 }, handler)
		await processWebhook(resendId, 'email.delivered', 'resend', { to: 'test@test.com' }, handler)

		const stripeRecord = await prisma.webhookEvent.findUnique({
			where: { eventId: stripeId },
		})
		const resendRecord = await prisma.webhookEvent.findUnique({
			where: { eventId: resendId },
		})

		expect(stripeRecord!.provider).toBe('stripe')
		expect(stripeRecord!.status).toBe('PROCESSED')
		expect(resendRecord!.provider).toBe('resend')
		expect(resendRecord!.status).toBe('PROCESSED')

		// Cleanup
		await prisma.webhookEvent.delete({ where: { eventId: stripeId } })
		await prisma.webhookEvent.delete({ where: { eventId: resendId } })
	})

	test('stores complex payload as JSON', async () => {
		const eventId = `evt_complex_${Date.now()}`
		const complexPayload = {
			type: 'invoice.paid',
			data: {
				object: {
					id: 'in_123',
					amount_paid: 5000,
					currency: 'eur',
					lines: { data: [{ amount: 2500 }, { amount: 2500 }] },
					metadata: { orderId: 'ord_xyz' },
				},
			},
		}

		const handler: WebhookHandler = async () => {}
		await processWebhook(eventId, 'invoice.paid', 'stripe', complexPayload, handler)

		const record = await prisma.webhookEvent.findUnique({
			where: { eventId },
		})
		expect(record!.payload).toEqual(complexPayload)
		expect((record!.payload as any).data.object.amount_paid).toBe(5000)

		// Cleanup
		await prisma.webhookEvent.delete({ where: { eventId } })
	})

	test('throws and records Sentry-worthy errors', async () => {
		const eventId = `evt_sentry_${Date.now()}`
		const criticalError = new Error('Payment processing infrastructure failure')

		const handler: WebhookHandler = async () => {
			throw criticalError
		}

		const result = await processWebhook(
			eventId,
			'payment.failed',
			'stripe',
			{ error: true },
			handler,
		)

		expect(result.processed).toBe(false)
		expect(result.status).toBe('FAILED')
		expect(result.error).toBe('Payment processing infrastructure failure')

		// Cleanup
		await prisma.webhookEvent.delete({ where: { eventId } })
	})

	test('returns PROCESSED when already processed event is received again', async () => {
		const eventId = `evt_already_${Date.now()}`
		let callCount = 0
		const handler: WebhookHandler = async () => {
			callCount++
		}

		// Process once
		await processWebhook(eventId, 'test.event', 'stripe', {}, handler)
		expect(callCount).toBe(1)

		// Send again
		const result = await processWebhook(eventId, 'test.event', 'stripe', { different: 'payload' }, handler)
		expect(result.processed).toBe(false)
		expect(callCount).toBe(1)

		// Cleanup
		await prisma.webhookEvent.delete({ where: { eventId } })
	})
})
