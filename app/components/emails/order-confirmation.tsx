/**
 * Order Confirmation Email Template
 *
 * Sent to the customer when their order is successfully created via Stripe checkout.
 */

import * as E from '@react-email/components'
import * as Sentry from '@sentry/react-router'
import { type ReactElement } from 'react'
import { sendEmail } from '#app/utils/email.server.ts'

export interface OrderConfirmationEmailData {
	orderNumber: string
	total: number // in cents
	domainUrl: string
}

/**
 * Order Confirmation Email Template
 * Sent when an order is created and confirmed via Stripe checkout
 */
export function OrderConfirmationEmail({
	orderNumber,
	total,
	domainUrl,
}: OrderConfirmationEmailData): ReactElement {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<E.Section>
					<E.Heading>Order Confirmation</E.Heading>
					<E.Text>Thank you for your order!</E.Text>
				</E.Section>

				<E.Section>
					<E.Text>
						<strong>Order Number:</strong> {orderNumber}
					</E.Text>
					<E.Text>
						<strong>Total:</strong> ${(total / 100).toFixed(2)}
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Link href={`${domainUrl}/shop/orders/${orderNumber}`}>
						View Order Details
					</E.Link>
				</E.Section>

				<E.Section>
					<E.Text>
						If you have any questions about your order, please don't
						hesitate to contact us.
					</E.Text>
				</E.Section>
			</E.Container>
		</E.Html>
	)
}

/**
 * Sends an order confirmation email to the customer
 * when their order is successfully created via Stripe checkout.
 *
 * @param data - Order confirmation email data
 * @param email - Customer email address
 */
export async function sendOrderConfirmationEmail(
	data: OrderConfirmationEmailData,
	email: string,
): Promise<void> {
	try {
		await sendEmail({
			to: email,
			subject: `Order Confirmation - ${data.orderNumber}`,
			react: <OrderConfirmationEmail {...data} />,
		})
	} catch (error) {
		// Log email error but don't fail order creation
		Sentry.captureException(error, {
			tags: { context: 'order-confirmation-email' },
			extra: { orderNumber: data.orderNumber },
		})
	}
}
