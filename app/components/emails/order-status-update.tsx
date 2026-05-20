/**
 * Order Status Update Email Template
 *
 * Sent to the customer when an admin updates the order status
 * (e.g., to SHIPPED, DELIVERED, etc.).
 */

import * as E from '@react-email/components'
import * as Sentry from '@sentry/react-router'
import { type ReactElement } from 'react'
import { sendEmail } from '#app/utils/email.server.ts'

export interface OrderStatusUpdateEmailData {
	orderNumber: string
	statusLabel: string
	trackingNumber: string | null
	domainUrl: string
}

/**
 * Order Status Update Email Template
 * Sent when admin updates the order status with optional tracking info
 */
export function OrderStatusUpdateEmail({
	orderNumber,
	statusLabel,
	trackingNumber,
	domainUrl,
}: OrderStatusUpdateEmailData): ReactElement {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<E.Section>
					<E.Heading>Order Status Update</E.Heading>
					<E.Text>Your order status has been updated.</E.Text>
				</E.Section>

				<E.Section>
					<E.Text>
						<strong>Order Number:</strong> {orderNumber}
					</E.Text>
					<E.Text>
						<strong>New Status:</strong> {statusLabel}
					</E.Text>
					{trackingNumber && (
						<E.Text>
							<strong>Tracking Number:</strong> {trackingNumber}
						</E.Text>
					)}
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
 * Sends an order status update email to the customer
 * when admin updates the order status.
 *
 * @param data - Order status update email data
 * @param email - Customer email address
 */
export async function sendOrderStatusUpdateEmail(
	data: OrderStatusUpdateEmailData,
	email: string,
): Promise<void> {
	try {
		await sendEmail({
			to: email,
			subject: `Order Status Update - ${data.orderNumber}`,
			react: <OrderStatusUpdateEmail {...data} />,
		})
	} catch (error) {
		// Log email error but don't fail status update
		Sentry.captureException(error, {
			tags: { context: 'order-status-email' },
			extra: { orderNumber: data.orderNumber },
		})
	}
}
