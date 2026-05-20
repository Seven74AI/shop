import { invariant } from '@epic-web/invariant'
import { type OrderStatus } from '@prisma/client'
import * as Sentry from '@sentry/react-router'
import type Stripe from 'stripe'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { type Locale, getLocale, getTranslations } from './i18n.server.ts'
import { createT } from './i18n.tsx'
import { getDomainUrl } from './misc.tsx'
import { generateOrderNumber } from './order-number.server.ts'
import { getOrderByCheckoutSessionId } from './order-queries.server.ts'
import { getOrderStatusLabel } from './order-status.ts'
import { StockUnavailableError } from './order-stock.server.ts'
import { stripe } from './stripe.server.ts'

/**
 * Returns the best locale for an order's email notification.
 * Priority: request locale (from cookie/Accept-Language) > taxCountry heuristic > 'en'
 */
function getOrderLocale(request?: Request, taxCountry?: string): Locale {
	if (request) {
		return getLocale(request)
	}
	if (taxCountry?.toUpperCase() === 'FR') return 'fr'
	return 'en'
}

/**
 * Updates an order status (admin only) and sends email notification.
 */
export async function updateOrderStatus(
	orderId: string,
	status: OrderStatus,
	request?: Request,
	trackingNumber?: string | null,
): Promise<void> {
	const order = await prisma.order.update({
		where: { id: orderId },
		data: {
			status,
			...(status === 'SHIPPED'
				? { trackingNumber: trackingNumber ?? '' }
				: {}),
		},
		select: {
			id: true,
			orderNumber: true,
			email: true,
			status: true,
			trackingNumber: true,
			shippingCountry: true,
		},
	})

	try {
		const locale = getOrderLocale(request, order.shippingCountry)
		const translations = await getTranslations(locale)
		const t = createT(translations)
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
		const statusLabel = getOrderStatusLabel(status)

		const subject = t('email.statusUpdate.subject', { orderNumber: order.orderNumber })

		let emailBody = `
			<h1>${t('email.statusUpdate.heading')}</h1>
			<p>${t('email.statusUpdate.body')}</p>
			<p><strong>${t('email.statusUpdate.orderNumber')}:</strong> ${order.orderNumber}</p>
			<p><strong>${t('email.statusUpdate.newStatus')}:</strong> ${statusLabel}</p>
		`

		if (status === 'SHIPPED' && order.trackingNumber) {
			emailBody += `<p><strong>${t('email.statusUpdate.trackingNumber')}:</strong> ${order.trackingNumber}</p>`
		}

		emailBody += `<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">${t('email.orderConfirmation.viewDetails')}</a></p>`

		let textBody = `
${t('email.statusUpdate.heading')}

${t('email.statusUpdate.body')}

${t('email.statusUpdate.orderNumber')}: ${order.orderNumber}
${t('email.statusUpdate.newStatus')}: ${statusLabel}
`

		if (status === 'SHIPPED' && order.trackingNumber) {
			textBody += `${t('email.statusUpdate.trackingNumber')}: ${order.trackingNumber}\n`
		}

		textBody += `${t('email.orderConfirmation.viewDetails')}: ${domainUrl}/shop/orders/${order.orderNumber}`

		await sendEmail({
			to: order.email,
			subject,
			html: emailBody,
			text: textBody,
		})
	} catch (emailError) {
		Sentry.captureException(emailError, {
			tags: { context: 'order-status-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}
}

/**
 * Cancels an order and creates a Stripe refund (admin only).
 */
export async function cancelOrder(orderId: string, request?: Request): Promise<void> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			orderNumber: true,
			email: true,
			status: true,
			stripePaymentIntentId: true,
			stripeChargeId: true,
			total: true,
			shippingCountry: true,
		},
	})

	invariant(order, 'Order not found')
	invariant(order.status !== 'CANCELLED', 'Order is already cancelled')

	let refundId: string | null = null
	if (order.stripePaymentIntentId || order.stripeChargeId) {
		try {
			const refundParams: Stripe.RefundCreateParams = {
				amount: order.total,
				reason: 'requested_by_customer',
				metadata: {
					orderNumber: order.orderNumber,
					cancelledBy: 'admin',
				},
			}

			if (order.stripePaymentIntentId) {
				refundParams.payment_intent = order.stripePaymentIntentId
			} else if (order.stripeChargeId) {
				refundParams.charge = order.stripeChargeId
			}

			const refund = await stripe.refunds.create(refundParams)
			refundId = refund.id
		} catch (refundError) {
			Sentry.captureException(refundError, {
				tags: { context: 'order-cancellation-refund' },
				extra: { orderNumber: order.orderNumber },
			})
		}
	}

	await prisma.order.update({
		where: { id: orderId },
		data: { status: 'CANCELLED' },
	})

	try {
		const locale = getOrderLocale(request, order.shippingCountry)
		const translations = await getTranslations(locale)
		const t = createT(translations)
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'

		const subject = t('email.cancellation.subject', { orderNumber: order.orderNumber })

		await sendEmail({
			to: order.email,
			subject,
			html: `
				<h1>${t('email.cancellation.heading')}</h1>
				<p>${t('email.cancellation.body')}</p>
				<p><strong>${t('email.orderConfirmation.orderNumber')}:</strong> ${order.orderNumber}</p>
				${refundId ? `<p><strong>${t('email.cancellation.refundId')}:</strong> ${refundId}</p>` : ''}
				<p>${refundId ? t('email.cancellation.refundProcessed') : t('email.cancellation.contactSupport')}</p>
				<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">${t('email.orderConfirmation.viewDetails')}</a></p>
			`,
			text: `
${t('email.cancellation.heading')}

${t('email.cancellation.body')}

${t('email.orderConfirmation.orderNumber')}: ${order.orderNumber}
${refundId ? `${t('email.cancellation.refundId')}: ${refundId}` : ''}
${refundId ? t('email.cancellation.refundProcessed') : t('email.cancellation.contactSupport')}

${t('email.orderConfirmation.viewDetails')}: ${domainUrl}/shop/orders/${order.orderNumber}
			`,
		})
	} catch (emailError) {
		Sentry.captureException(emailError, {
			tags: { context: 'order-cancellation-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}
}

/**
 * Creates an order from a Stripe checkout session.
 * Handles payment verification, idempotency, stock validation, atomic
 * order creation + stock decrement + cart deletion.
 */
export async function createOrderFromStripeSession(
	sessionId: string,
	fullSession?: Stripe.Checkout.Session,
	request?: Request,
): Promise<{ id: string; orderNumber: string }> {
	// Idempotency: if order already exists, just ensure cart is cleaned up.
	const existingOrder = await getOrderByCheckoutSessionId(sessionId)
	if (existingOrder) {
		const session = fullSession || await stripe.checkout.sessions.retrieve(sessionId)
		const cartId = session.metadata?.cartId
		if (cartId) {
			try {
				await prisma.cartItem.deleteMany({ where: { cartId } })
				await prisma.cart.delete({ where: { id: cartId } }).catch(() => {
					// Cart might already be deleted - that's fine
				})
			} catch {
				// Cart might already be deleted or not exist - that's fine
			}
		}
		return { id: existingOrder.id, orderNumber: existingOrder.orderNumber }
	}

	const session = fullSession || await stripe.checkout.sessions.retrieve(sessionId, {
		expand: ['line_items', 'payment_intent'],
	})

	if (session.payment_status !== 'paid') {
		throw new Error(
			`Payment not completed for session ${sessionId}. Payment status: ${session.payment_status}`,
		)
	}

	const cartId = session.metadata?.cartId
	const userId = session.metadata?.userId || null
	invariant(cartId, 'Missing cartId in session metadata')

	const cart = await prisma.cart.findUnique({
		where: { id: cartId },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							description: true,
							price: true,
							stockQuantity: true,
						},
					},
					variant: {
						select: {
							id: true,
							price: true,
							stockQuantity: true,
						},
					},
				},
			},
		},
	})

	invariant(cart, 'Cart not found')
	invariant(cart.items.length > 0, 'Cart is empty')

	const order = await prisma.$transaction(
		async (tx) => {
			for (const item of cart.items) {
				if (item.variantId && item.variant) {
					const variant = await tx.productVariant.findUnique({
						where: { id: item.variantId },
						select: { id: true, stockQuantity: true },
					})
					invariant(
						variant,
						`Variant ${item.variantId} not found for product ${item.product.name}`,
					)
					if (variant.stockQuantity < item.quantity) {
						throw new StockUnavailableError({
							productName: item.product.name,
							requested: item.quantity,
							available: variant.stockQuantity,
						})
					}
				} else {
					const product = await tx.product.findUnique({
						where: { id: item.productId },
						select: { id: true, name: true, stockQuantity: true },
					})
					invariant(product, `Product ${item.productId} not found`)
					if (
						product.stockQuantity !== null &&
						product.stockQuantity < item.quantity
					) {
						throw new StockUnavailableError({
							productName: product.name,
							requested: item.quantity,
							available: product.stockQuantity,
						})
					}
				}
			}

			for (const item of cart.items) {
				if (item.variantId) {
					await tx.productVariant.update({
						where: { id: item.variantId },
						data: { stockQuantity: { decrement: item.quantity } },
					})
				} else {
					const product = await tx.product.findUnique({
						where: { id: item.productId },
						select: { stockQuantity: true },
					})
					if (product && product.stockQuantity !== null) {
						await tx.product.update({
							where: { id: item.productId },
							data: { stockQuantity: { decrement: item.quantity } },
						})
					}
				}
			}

			const orderNumber = await generateOrderNumber(tx)

			const paymentIntentId =
				typeof session.payment_intent === 'string'
					? session.payment_intent
					: session.payment_intent?.id || null

			let chargeId: string | null = null
			if (paymentIntentId) {
				try {
					const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
					if (typeof paymentIntent.latest_charge === 'string') {
						chargeId = paymentIntent.latest_charge
					}
				} catch (err) {
					Sentry.captureException(err, {
						tags: { context: 'order-charge-retrieval' },
						extra: { paymentIntentId },
					})
				}
			}

			const shippingMethodId = session.metadata?.shippingMethodId || null
			const shippingCost = session.metadata?.shippingCost
				? parseInt(session.metadata.shippingCost, 10)
				: 0
			const mondialRelayPickupPointId =
				session.metadata?.mondialRelayPickupPointId || null

			let shippingMethodName: string | null = null
			let shippingCarrierName: string | null = null
			let mondialRelayPickupPointName: string | null = null

			if (shippingMethodId) {
				const shippingMethod = await tx.shippingMethod.findUnique({
					where: { id: shippingMethodId },
					include: {
						carrier: {
							select: {
								displayName: true,
							},
						},
					},
				})

				if (shippingMethod) {
					shippingMethodName = shippingMethod.name
					shippingCarrierName = shippingMethod.carrier?.displayName || null
				}
			}

			const calculatedSubtotal = (session.amount_subtotal ?? 0) - shippingCost

			const newOrder = await tx.order.create({
				data: {
					orderNumber,
					userId: userId || null,
					email:
						session.customer_email ||
						session.metadata?.email ||
						'',
					subtotal: calculatedSubtotal,
					total: session.amount_total ?? 0,
					shippingName: session.metadata?.shippingName || '',
					shippingStreet: session.metadata?.shippingStreet || '',
					shippingCity: session.metadata?.shippingCity || '',
					shippingState: session.metadata?.shippingState || null,
					shippingPostal: session.metadata?.shippingPostal || '',
					shippingCountry: session.metadata?.shippingCountry || 'US',
					shippingMethodId,
					shippingCost,
					shippingMethodName,
					shippingCarrierName,
					mondialRelayPickupPointId,
					mondialRelayPickupPointName,
					stripeCheckoutSessionId: session.id,
					stripePaymentIntentId: paymentIntentId,
					stripeChargeId: chargeId,
					status: 'CONFIRMED',
				},
			})

			await Promise.all(
				cart.items.map((item) =>
					tx.orderItem.create({
						data: {
							orderId: newOrder.id,
							productId: item.productId,
							variantId: item.variantId,
							price:
								item.variantId && item.variant
									? item.variant.price ?? item.product.price
									: item.product.price,
							quantity: item.quantity,
						},
					}),
				),
			)

			await tx.cartItem.deleteMany({ where: { cartId } })
			await tx.cart.delete({ where: { id: cartId } })

			return newOrder
		},
		{ timeout: 30000 },
	)

	try {
		const locale = getOrderLocale(request, order.shippingCountry)
		const translations = await getTranslations(locale)
		const t = createT(translations)
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'

		await sendEmail({
			to: order.email,
			subject: t('email.orderConfirmation.subject', { orderNumber: order.orderNumber }),
			html: `
				<h1>${t('email.orderConfirmation.heading')}</h1>
				<p>${t('email.orderConfirmation.thankYou')}</p>
				<p><strong>${t('email.orderConfirmation.orderNumber')}:</strong> ${order.orderNumber}</p>
				<p><strong>${t('email.orderConfirmation.total')}:</strong> ${(order.total / 100).toFixed(2)}</p>
				<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">${t('email.orderConfirmation.viewDetails')}</a></p>
			`,
			text: `
${t('email.orderConfirmation.heading')}

${t('email.orderConfirmation.thankYou')}

${t('email.orderConfirmation.orderNumber')}: ${order.orderNumber}
${t('email.orderConfirmation.total')}: ${(order.total / 100).toFixed(2)}

${t('email.orderConfirmation.viewDetails')}: ${domainUrl}/shop/orders/${order.orderNumber}
			`,
		})
	} catch (emailError) {
		Sentry.captureException(emailError, {
			tags: { context: 'order-confirmation-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}

	return { id: order.id, orderNumber: order.orderNumber }
}
