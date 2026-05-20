import { data } from 'react-router'
import { z } from 'zod'
import { sendNewsletterConfirmationEmail } from '#app/utils/newsletter-email.server.tsx'
import { createSubscription } from '#app/utils/newsletter.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/newsletter-subscribe.ts'

const SubscribeSchema = z.object({
	email: z.string().email('Please enter a valid email address').max(254),
})

/**
 * POST /resources/newsletter-subscribe
 *
 * Accepts an email address, creates a pending newsletter subscription,
 * and sends a double-opt-in confirmation email.
 *
 * Rate limiting: enforced by express-rate-limit on the /resources prefix.
 */
export async function action({ request }: Route.ActionArgs) {
	// Only accept POST
	if (request.method !== 'POST') {
		return data({ error: 'Method not allowed' }, { status: 405 })
	}

	let body: unknown
	try {
		body = await request.json()
	} catch {
		return data({ error: 'Invalid JSON body' }, { status: 400 })
	}

	const parsed = SubscribeSchema.safeParse(body)
	if (!parsed.success) {
		return data(
			{
				error: 'Invalid email address',
				details: parsed.error.flatten().fieldErrors,
			},
			{ status: 400 },
		)
	}

	const { email } = parsed.data

	try {
		const result = await createSubscription(email)

		if (!result.created) {
			// Don't reveal whether email exists; always return success
			if (result.reason === 'already_subscribed') {
				return data({
					success: true,
					message:
						"If you're already subscribed, you'll receive a confirmation email shortly.",
				})
			}
			if (result.reason === 'already_pending') {
				return data({
					success: true,
					message: 'A confirmation email has already been sent. Please check your inbox.',
				})
			}
			return data({
				success: true,
				message: 'Please check your email to confirm your subscription.',
			})
		}

		const domain = getDomainUrl(request)
		const confirmUrl = `${domain}/resources/newsletter-confirm?token=${encodeURIComponent(result.confirmationToken)}`

		// Send confirmation email using React Email template (fire-and-forget)
		void sendNewsletterConfirmationEmail(email, confirmUrl)

		return data({
			success: true,
			message: 'Please check your email to confirm your subscription.',
		})
	} catch (error) {
		console.error('Newsletter subscription error:', error)
		return data(
			{ error: 'An unexpected error occurred. Please try again later.' },
			{ status: 500 },
		)
	}
}

/**
 * GET is not supported on this endpoint.
 */
export async function loader() {
	return data({ error: 'Method not allowed' }, { status: 405 })
}
