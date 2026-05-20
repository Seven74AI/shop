/**
 * Abandoned Cart Recovery Email Template
 *
 * Email template sent to users who have left items in their cart.
 * Includes a recovery link to return to their cart.
 */

import * as E from '@react-email/components'
import { type ReactElement } from 'react'

export interface AbandonedCartEmailData {
	items: Array<{
		productName: string
		productImage?: string
		price: number // in cents
		quantity: number
	}>
	recoveryUrl: string
}

/**
 * Formats a price in cents to a display string.
 */
function formatPrice(cents: number): string {
	const dollars = cents / 100
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(dollars)
}

/**
 * Abandoned Cart Recovery Email Template
 * Sent when a user has items in their cart and hasn't checked out.
 */
export function AbandonedCartEmailTemplate({
	items,
	recoveryUrl,
}: AbandonedCartEmailData): ReactElement {
	const totalCents = items.reduce(
		(sum, item) => sum + item.price * item.quantity,
		0,
	)

	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<E.Section>
					<E.Heading>You left items in your cart!</E.Heading>
					<E.Text>
						We noticed you added some items to your cart but didn't complete
						your purchase. Your items are still waiting for you!
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Heading as="h2">Your Cart</E.Heading>
					{items.map((item, i) => (
						<E.Row key={i}>
							<E.Column>
								<E.Text>
									<strong>{item.productName}</strong>
									{item.quantity > 1 && ` × ${item.quantity}`}
								</E.Text>
							</E.Column>
							<E.Column align="right">
								<E.Text>
									{formatPrice(item.price * item.quantity)}
								</E.Text>
							</E.Column>
						</E.Row>
					))}
					<E.Hr />
					<E.Row>
						<E.Column>
							<E.Text>
								<strong>Total</strong>
							</E.Text>
						</E.Column>
						<E.Column align="right">
							<E.Text>
								<strong>{formatPrice(totalCents)}</strong>
							</E.Text>
						</E.Column>
					</E.Row>
				</E.Section>

				<E.Section>
					<E.Button href={recoveryUrl}>
						Return to Your Cart
					</E.Button>
					<E.Text>
						Or copy and paste this link into your browser:{' '}
						<E.Link href={recoveryUrl}>{recoveryUrl}</E.Link>
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Text>
						This link will expire in 7 days. If you didn't create an
						account with us, you can safely ignore this email.
					</E.Text>
					<E.Text>
						You're receiving this email because you have an account on our
						store and left items in your cart.
					</E.Text>
				</E.Section>
			</E.Container>
		</E.Html>
	)
}
