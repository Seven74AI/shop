/**
 * Order Cancellation Email Template
 *
 * Sent to the customer when their order is cancelled by an admin,
 * including refund information if applicable.
 */

import * as E from '@react-email/components'
import * as Sentry from '@sentry/react-router'
import { type ReactElement } from 'react'
import { sendEmail } from '#app/utils/email.server.ts'

export interface OrderCancellationEmailData {
	orderNumber: string
	refundId: string | null
	domainUrl: string
}

/**
 * Order Cancellation Email Template
 * Sent when an order is cancelled by an admin (with optional refund info)
 */
export function OrderCancellationEmail({
	orderNumber,
	refundId,
	domainUrl,
}: OrderCancellationEmailData): ReactElement {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<E.Section>
					<E.Heading>Order Cancelled</E.Heading>
					<E.Text>Your order has been cancelled.</E.Text>
				</E.Section>

				<E.Section>
					<E.Text>
						<strong>Order Number:</strong> {orderNumber}
					</E.Text>
					{refundId && (
						<E.Text>
							<strong>Refund ID:</strong> {refundId}
						</E.Text>
					)}
				</E.Section>

				<E.Section>
					<E.Text>
						{refundId
							? 'A refund has been processed and will appear in your account within 5-10 business days.'
							: 'If you have already been charged, please contact support for a refund.'}
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Link href={`${domainUrl}/shop/orders/${orderNumber}`}>
						View Order Details
					</E.Link>
				</E.Section>
			</E.Container>
		</E.Html>
	)
}

/**
 * Sends an order cancellation email to the customer
 * when their order has been cancelled by an admin.
 *
 * @param data - Order cancellation email data
 * @param email - Customer email address
 */
export async function sendOrderCancellationEmail(
	data: OrderCancellationEmailData,
	email: string,
): Promise<void> {
	try {
		await sendEmail({
			to: email,
			subject: `Order Cancelled - ${data.orderNumber}`,
			react: <OrderCancellationEmail {...data} />,
		})
	} catch (error) {
		// Log email error but don't fail cancellation
		Sentry.captureException(error, {
			tags: { context: 'order-cancellation-email' },
			extra: { orderNumber: data.orderNumber },
		})
	}
}
