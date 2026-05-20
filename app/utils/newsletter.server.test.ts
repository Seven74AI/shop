import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	createSubscription,
	confirmSubscription,
	unsubscribeFromNewsletter,
	getSubscription,
} from '#app/utils/newsletter.server.ts'

const TEST_EMAILS = [
	'test-newsletter@example.com',
	'test-newsletter-2@example.com',
	'uppercase@example.com',
]

async function cleanup() {
	for (const email of TEST_EMAILS) {
		await prisma.newsletterSubscription
			.deleteMany({ where: { email } })
			.catch(() => {})
	}
}

describe('newsletter.server', () => {
	beforeEach(async () => {
		await cleanup()
	})

	describe('createSubscription', () => {
		const testEmail = 'test-newsletter@example.com'

		it('creates a new pending subscription', async () => {
			const result = await createSubscription(testEmail)

			expect(result.created).toBe(true)
			if (!result.created) throw new Error('expected created')
			expect(result.subscription.email).toBe(testEmail)
			expect(result.subscription.status).toBe('PENDING')
			expect(result.confirmationToken).toBeDefined()
			expect(result.confirmationToken).toContain('.')
		})

		it('normalizes email to lowercase', async () => {
			const result = await createSubscription('UPPERCASE@EXAMPLE.COM')
			expect(result.created).toBe(true)
			if (!result.created) throw new Error('expected created')
			expect(result.subscription.email).toBe('uppercase@example.com')
		})

		it('returns already_subscribed for existing confirmed subscription', async () => {
			// First, confirm the subscription
			await prisma.newsletterSubscription.upsert({
				where: { email: testEmail },
				create: {
					email: testEmail,
					status: 'CONFIRMED',
					token: 'dummy-token',
					tokenExpiresAt: new Date(Date.now() + 86400000),
					confirmedAt: new Date(),
				},
				update: {
					status: 'CONFIRMED',
					token: 'dummy-token',
					tokenExpiresAt: new Date(Date.now() + 86400000),
					confirmedAt: new Date(),
				},
			})

			const result = await createSubscription(testEmail)
			expect(result.created).toBe(false)
			if (result.created) throw new Error('expected not created')
			expect(result.reason).toBe('already_subscribed')
		})

		it('returns already_pending for existing pending subscription', async () => {
			await createSubscription('test-newsletter-2@example.com')
			const result2 = await createSubscription('test-newsletter-2@example.com')
			expect(result2.created).toBe(false)
			if (result2.created) throw new Error('expected not created')
			expect(result2.reason).toBe('already_pending')
		})

		it('allows re-subscription after unsubscribing', async () => {
			const email = 'test-newsletter-2@example.com'
			// Directly create an unsubscribed record
			await prisma.newsletterSubscription.upsert({
				where: { email },
				create: {
					email,
					status: 'UNSUBSCRIBED',
					token: 'dummy-token',
					tokenExpiresAt: new Date(Date.now() + 86400000),
					unsubscribedAt: new Date(),
				},
				update: {
					status: 'UNSUBSCRIBED',
					token: 'dummy-token',
					tokenExpiresAt: new Date(Date.now() + 86400000),
					unsubscribedAt: new Date(),
				},
			})

			const result = await createSubscription(email)
			expect(result.created).toBe(true)
			if (!result.created) throw new Error('expected created')
			expect(result.subscription.status).toBe('PENDING')
		})
	})

	describe('confirmSubscription', () => {
		const testEmail = 'test-newsletter@example.com'

		it('confirms a subscription with a valid token', async () => {
			const result = await createSubscription(testEmail)
			expect(result.created).toBe(true)
			if (!result.created) throw new Error('expected created')

			const confirmResult = await confirmSubscription(result.confirmationToken)
			expect(confirmResult.success).toBe(true)
			if (!confirmResult.success) throw new Error('expected success')
			expect(confirmResult.subscription.status).toBe('CONFIRMED')
			expect(confirmResult.subscription.confirmedAt).toBeDefined()
		})

		it('rejects an invalid token', async () => {
			const result = await confirmSubscription('invalid-token.abc123')
			expect(result.success).toBe(false)
			if (result.success) throw new Error('expected failure')
			expect(result.reason).toBe('invalid_token')
		})

		it('rejects a malformed token', async () => {
			const result = await confirmSubscription('not-even-a-token')
			expect(result.success).toBe(false)
			if (result.success) throw new Error('expected failure')
			expect(result.reason).toBe('invalid_token')
		})

		it('rejects an empty token', async () => {
			const result = await confirmSubscription('')
			expect(result.success).toBe(false)
			if (result.success) throw new Error('expected failure')
			expect(result.reason).toBe('invalid_token')
		})

		it('token becomes invalid after first use (token is cleared from DB)', async () => {
			const create = await createSubscription(testEmail)
			if (!create.created) throw new Error('expected created')
			const token = create.confirmationToken

			await confirmSubscription(token)

			// Token was cleared from DB — second confirmation should fail
			const result = await confirmSubscription(token)
			expect(result.success).toBe(false)
			if (result.success) throw new Error('expected failure')
		})

		it('rejects expired tokens', async () => {
			const create = await createSubscription(testEmail)
			if (!create.created) throw new Error('expected created')

			// Manually expire the token
			await prisma.newsletterSubscription.update({
				where: { id: create.subscription.id },
				data: {
					tokenExpiresAt: new Date('2020-01-01'),
				},
			})

			const result = await confirmSubscription(create.confirmationToken)
			expect(result.success).toBe(false)
			if (result.success) throw new Error('expected failure')
			expect(result.reason).toBe('expired')
		})
	})

	describe('unsubscribeFromNewsletter', () => {
		const testEmail = 'test-newsletter@example.com'

		it('unsubscribes a pending subscription', async () => {
			const create = await createSubscription(testEmail)
			if (!create.created) throw new Error('expected created')
			const token = create.confirmationToken

			const result = await unsubscribeFromNewsletter(token)
			expect(result.success).toBe(true)
			if (!result.success) throw new Error('expected success')
			expect(result.subscription.status).toBe('UNSUBSCRIBED')
			expect(result.subscription.unsubscribedAt).toBeDefined()
		})

		it('rejects unsubscribe with invalid token', async () => {
			const result = await unsubscribeFromNewsletter('invalid.token')
			expect(result.success).toBe(false)
			if (result.success) throw new Error('expected failure')
			expect(result.reason).toBe('invalid_token')
		})

		it('returns not_found after token is already used', async () => {
			const create = await createSubscription(testEmail)
			if (!create.created) throw new Error('expected created')
			const token = create.confirmationToken

			await unsubscribeFromNewsletter(token)

			// Token was cleared
			const result2 = await unsubscribeFromNewsletter(token)
			expect(result2.success).toBe(false)
			if (result2.success) throw new Error('expected failure')
			expect(result2.reason).toBe('not_found')
		})
	})

	describe('getSubscription', () => {
		const testEmail = 'test-newsletter@example.com'

		it('returns a subscription by email', async () => {
			await createSubscription(testEmail)

			const sub = await getSubscription(testEmail)
			expect(sub).toBeDefined()
			expect(sub!.email).toBe(testEmail)
		})

		it('returns null for non-existent email', async () => {
			const sub = await getSubscription('nonexistent@example.com')
			expect(sub).toBeNull()
		})

		it('normalizes email to lowercase', async () => {
			await createSubscription(testEmail)

			const sub = await getSubscription('TEST-NEWSLETTER@EXAMPLE.COM')
			expect(sub).toBeDefined()
			expect(sub!.email).toBe(testEmail)
		})
	})
})
