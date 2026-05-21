import { data } from 'react-router'
import { confirmSubscription } from '#app/utils/newsletter.server.ts'
import { type Route } from './+types/newsletter-confirm.ts'

/**
 * GET /resources/newsletter-confirm?token=...
 *
 * Confirms a newsletter subscription via the double-opt-in token.
 * Returns a simple HTML page confirming the subscription or showing an error.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const token = url.searchParams.get('token')

	if (!token) {
		return data({ error: 'Missing confirmation token.' }, { status: 400 })
	}

	try {
		const result = await confirmSubscription(token)

		if (!result.success) {
			const messages: Record<string, { title: string; message: string }> = {
				invalid_token: {
					title: 'Invalid Token',
					message: 'This confirmation link is invalid. Please request a new one.',
				},
				not_found: {
					title: 'Not Found',
					message: 'No subscription was found for this confirmation link.',
				},
				expired: {
					title: 'Link Expired',
					message:
						'This confirmation link has expired. Please subscribe again to receive a new one.',
				},
				unsubscribed: {
					title: 'Unsubscribed',
					message: 'This email has been unsubscribed from our newsletter.',
				},
			}

			const msg = messages[result.reason] ?? {
				title: 'Error',
				message: 'An unexpected error occurred. Please try again.',
			}

			return data(msg, { status: 400 })
		}

		if (result.alreadyConfirmed) {
			return data({
				title: 'Already Confirmed',
				message: 'Your subscription was already confirmed. You\'re all set!',
			})
		}

		return data({
			title: 'Subscription Confirmed!',
			message: 'Thank you for confirming your subscription. You\'ll now receive our newsletter.',
		})
	} catch (error) {
		console.error('Newsletter confirmation error:', error)
		return data(
			{
				title: 'Error',
				message: 'An unexpected error occurred. Please try again later.',
			},
			{ status: 500 },
		)
	}
}
