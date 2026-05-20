/**
 * Abandoned Cart Recovery Email Template + Resend Integration
 *
 * Email template for abandoned cart recovery — sent to users who left
 * items in their cart without completing checkout.
 *
 * Part 2/3 of abandoned cart recovery: detection (Part 1) → email (Part 2) → cron integration (Part 3)
 */

import * as E from '@react-email/components'
import { type ReactElement } from 'react'
import {
	type AbandonedCart,
	markRecoveryEmailSent,
} from './abandoned-cart.server.ts'
import { sendEmail } from './email.server.ts'
import { getDomainUrl } from './misc.tsx'

export interface AbandonedCartEmailData {
	/** Display name for the customer (username, name, or "Valued Customer") */
	customerName: string
	/** Items left in the cart */
	items: Array<{
		productName: string
		productSlug: string
		quantity: number
	}>
	/** URL to recover the cart (cart page) */
	cartUrl: string
	/** How many days until the cart may be cleaned up */
	expiresInDays?: number
}

/**
 * Abandoned Cart Recovery Email Template
 *
 * Reminds the customer they left items in their cart and provides
 * a direct link to resume checkout. Uses semantic, accessible HTML
 * with React Email components for consistent rendering across clients.
 */
export function AbandonedCartEmail({
	customerName,
	items,
	cartUrl,
	expiresInDays = 7,
}: AbandonedCartEmailData): ReactElement {
	const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<E.Section>
					<E.Heading>Your Cart is Waiting</E.Heading>
					<E.Text>Hello {customerName},</E.Text>
					<E.Text>
						You left {itemCount} {itemCount === 1 ? 'item' : 'items'} in
						your cart. Your items are still reserved, but they won't last
						forever — complete your order before they're gone!
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Heading as="h2">Items in Your Cart</E.Heading>
					{items.map((item) => (
						<E.Text key={item.productSlug}>
							<strong>{item.productName}</strong>
							{item.quantity > 1 ? ` (×${item.quantity})` : ''}
						</E.Text>
					))}
				</E.Section>

				<E.Section>
					<E.Button href={cartUrl}>Return to Your Cart</E.Button>
				</E.Section>

				<E.Section>
					<E.Text>
						Or copy and paste this URL into your browser:
					</E.Text>
					<E.Text>
						<E.Link href={cartUrl}>{cartUrl}</E.Link>
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Text style={{ fontSize: '12px', color: '#6b7280' }}>
						Your cart will be cleared in approximately {expiresInDays} days
						if no action is taken. You can also remove items anytime by
						visiting your cart.
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Text style={{ fontSize: '12px', color: '#9ca3af' }}>
						You received this email because you have items in your cart
						and haven't completed checkout. If you no longer wish to
						receive these reminders, you can update your preferences in
						your account settings.
					</E.Text>
				</E.Section>
			</E.Container>
		</E.Html>
	)
}

/**
 * Sends an abandoned cart recovery email to the customer.
 *
 * Looks up the user's email address, renders the email template
 * with their cart items, sends via Resend (or mocks in dev/test),
 * and records the recovery email on the cart.
 *
 * For guest carts (no userId → no email), this function is a no-op.
 *
 * @param cart - The abandoned cart with items (from findAbandonedCarts)
 * @param userEmail - The customer's email address
 * @param customerName - Display name for the customer
 * @param request - Optional Request for domain URL resolution
 * @returns true if an email was sent, false if skipped (guest/no email)
 */
export async function sendAbandonedCartEmail(
	cart: AbandonedCart,
	userEmail: string,
	customerName: string,
	request?: Request,
): Promise<boolean> {
	// Guard: no email → nothing to send (guest carts)
	if (!userEmail) {
		return false
	}

	const domainUrl = request
		? getDomainUrl(request)
		: 'http://localhost:3000'
	const cartUrl = `${domainUrl}/cart`

	await sendEmail({
		to: userEmail,
		subject: `You left ${cart.items.length} ${cart.items.length === 1 ? 'item' : 'items'} in your cart`,
		react: (
			<AbandonedCartEmail
				customerName={customerName}
				items={cart.items.map((i) => ({
					productName: i.productName,
					productSlug: i.productSlug,
					quantity: i.quantity,
				}))}
				cartUrl={cartUrl}
				expiresInDays={7}
			/>
		),
	})

	// Record that we sent a recovery email for this cart
	await markRecoveryEmailSent(cart.id)

	return true
}
