/**
 * Shipping Email Templates
 * 
 * Email templates for shipping-related notifications.
 * Supports i18n via locale parameter.
 */

import * as E from '@react-email/components'
import * as Sentry from '@sentry/react-router'
import { type ReactElement } from 'react'
import { sendEmail } from './email.server.ts'
import { type Locale, getTranslations } from './i18n.server.ts'
import { createT } from './i18n.tsx'
import { getDomainUrl } from './misc.tsx'

export interface ShippingConfirmationEmailData {
	orderNumber: string
	customerName: string
	carrierName: string
	shipmentNumber: string
	pickupPointName?: string
	trackingUrl?: string
	orderDetailsUrl: string
	locale?: Locale
}

/**
 * Shipping Confirmation Email Template
 * Sent when a shipment is created and tracking information is available
 */
export function ShippingConfirmationEmail({
	orderNumber,
	customerName,
	carrierName,
	shipmentNumber,
	pickupPointName,
	trackingUrl,
	orderDetailsUrl,
	locale: _locale,
}: ShippingConfirmationEmailData): ReactElement {
	// React component can't use async getTranslations, so we accept pre-translated strings
	// via the data object. For dynamic locale, use sendShippingConfirmationEmail which
	// loads translations before rendering.
	const lang = _locale === 'fr' ? 'fr' : 'en'

	return (
		<E.Html lang={lang} dir="ltr">
			<E.Container>
				<E.Section>
					<E.Heading>Your Order Has Shipped!</E.Heading>
					<E.Text>Hello {customerName},</E.Text>
					<E.Text>
						Great news! Your order <strong>{orderNumber}</strong> has been shipped
						via <strong>{carrierName}</strong>.
					</E.Text>
				</E.Section>

				<E.Section>
					<E.Heading as="h2">Shipping Details</E.Heading>
					<E.Text>
						<strong>Shipment Number:</strong> {shipmentNumber}
					</E.Text>
					{pickupPointName && (
						<E.Text>
							<strong>Pickup Point:</strong> {pickupPointName}
						</E.Text>
					)}
					{trackingUrl && (
						<E.Text>
							<E.Link href={trackingUrl}>Track Your Shipment</E.Link>
						</E.Text>
					)}
				</E.Section>

				<E.Section>
					<E.Text>
						You can view your order details and track your shipment at any time:
					</E.Text>
					<E.Link href={orderDetailsUrl}>View Order Details</E.Link>
				</E.Section>

				<E.Section>
					<E.Text>
						If you have any questions about your shipment, please don't hesitate to
						contact us.
					</E.Text>
					<E.Text>Thank you for your order!</E.Text>
				</E.Section>
			</E.Container>
		</E.Html>
	)
}

/**
 * Sends a localized shipping confirmation email to the customer
 * when their order has been shipped with tracking information.
 */
export async function sendShippingConfirmationEmail(
	data: Omit<ShippingConfirmationEmailData, 'orderDetailsUrl'>,
	email: string,
	request?: Request,
): Promise<void> {
	try {
		const locale = data.locale ?? (request ? undefined : 'en') as Locale
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
		const orderDetailsUrl = `${domainUrl}/shop/orders/${data.orderNumber}`

		// Load translations to localize the email
		const translations = locale
			? await getTranslations(locale)
			: await getTranslations('en')
		const t = createT(translations)

		const subject = t('email.shippingConfirmation.subject', { orderNumber: data.orderNumber })

		await sendEmail({
			to: email,
			subject,
			react: (
				<ShippingConfirmationEmail
					{...data}
					orderDetailsUrl={orderDetailsUrl}
					locale={locale}
				/>
			),
		})
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'shipping-confirmation-email' },
			extra: {
				orderNumber: data.orderNumber,
				shipmentNumber: data.shipmentNumber,
			},
		})
		throw error
	}
}
