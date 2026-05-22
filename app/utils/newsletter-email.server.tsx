/**
 * Newsletter Email Templates
 *
 * Email templates for newsletter double-opt-in flow:
 * - Confirmation email (sent on subscribe)
 * - Unsubscribe confirmation (sent after unsubscribe via token)
 */

import * as E from '@react-email/components'
import { type ReactElement } from 'react'
import { sendEmail } from './email.server.ts'
import { log } from '#app/utils/logging.server.ts'

export interface NewsletterConfirmationEmailData {
	email: string
	confirmUrl: string
}

/**
 * Newsletter Confirmation Email Template
 * Sent when a user subscribes to the newsletter.
 * Contains the double-opt-in confirmation link.
 */
export function NewsletterConfirmationEmail({
	email,
	confirmUrl,
}: NewsletterConfirmationEmailData): ReactElement {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<E.Section>
					<E.Heading>Confirm Your Newsletter Subscription</E.Heading>
					<E.Text>Hello,</E.Text>
					<E.Text>
						Thanks for subscribing to our newsletter! Please confirm your
						subscription by clicking the link below.
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Button href={confirmUrl}>
						Confirm Subscription
					</E.Button>
				</E.Section>

				<E.Section>
					<E.Text>
						Or copy and paste this URL into your browser:
					</E.Text>
					<E.Text>
						<E.Link href={confirmUrl}>{confirmUrl}</E.Link>
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Text>
						This link expires in 7 days. If you didn't request this
						subscription, you can safely ignore this email.
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Text style={{ fontSize: '12px', color: '#6b7280' }}>
						This email was sent to {email}. You are receiving this email because
						you (or someone else) signed up for our newsletter.
					</E.Text>
				</E.Section>
			</E.Container>
		</E.Html>
	)
}

/**
 * Sends a newsletter confirmation email for the double-opt-in flow.
 *
 * @param email - Subscriber's email address
 * @param confirmUrl - The confirmation URL with the token
 */
export async function sendNewsletterConfirmationEmail(
	email: string,
	confirmUrl: string,
): Promise<void> {
	try {
		await sendEmail({
			to: email,
			subject: 'Confirm your newsletter subscription',
			react: <NewsletterConfirmationEmail email={email} confirmUrl={confirmUrl} />,
		})
	} catch (error) {
		// Log email error but don't fail the subscription flow
		// (called as fire-and-forget in the subscribe route)
		log.error({ err: error }, 'Failed to send newsletter confirmation email')
	}
}
