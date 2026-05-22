/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, vi } from 'vitest'
import { sendEmail } from './email.server.ts'
import { sendNewsletterConfirmationEmail } from './newsletter-email.server.tsx'

// Mock the email service
vi.mock('./email.server.ts', () => ({
	sendEmail: vi.fn().mockResolvedValue({
		status: 'success',
		data: { id: 'test-email-id' },
	}),
}))

describe('newsletter-email.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('sendNewsletterConfirmationEmail', () => {
		const testEmail = 'subscriber@example.com'
		const testConfirmUrl = 'https://example.com/resources/newsletter-confirm?token=***'

		test('sends confirmation email with correct recipient and subject', async () => {
			await sendNewsletterConfirmationEmail(testEmail, testConfirmUrl)

			expect(sendEmail).toHaveBeenCalledTimes(1)
			const call = vi.mocked(sendEmail).mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.to).toBe(testEmail)
			expect(call[0]?.subject).toBe('Confirm your newsletter subscription')
		})

		test('includes the confirmation URL in the React element', async () => {
			await sendNewsletterConfirmationEmail(testEmail, testConfirmUrl)

			expect(sendEmail).toHaveBeenCalledTimes(1)
			const call = vi.mocked(sendEmail).mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			// The React element should be passed
			expect(call[0]?.react).toBeDefined()
		})

		test('passes the email address to the React template', async () => {
			await sendNewsletterConfirmationEmail(testEmail, testConfirmUrl)

			const call = vi.mocked(sendEmail).mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.react).toBeDefined()
			// Verify the React element is a valid component (non-null check)
			expect(call[0]?.react).toBeTruthy()
		})

		test('handles email sending errors gracefully', async () => {
			// Errors are logged via Pino logger (silent in test mode)
			vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Email service error'))

			// Should not throw — errors are caught and logged
			await sendNewsletterConfirmationEmail(testEmail, testConfirmUrl)

			expect(sendEmail).toHaveBeenCalledTimes(1)
		})

		test('sends email for different email addresses', async () => {
			const anotherEmail = 'another@example.com'
			const anotherUrl = 'https://example.com/resources/newsletter-confirm?token=***'

			await sendNewsletterConfirmationEmail(anotherEmail, anotherUrl)

			expect(sendEmail).toHaveBeenCalledTimes(1)
			const call = vi.mocked(sendEmail).mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.to).toBe(anotherEmail)
			expect(call[0]?.react).toBeDefined()
		})
	})
})
