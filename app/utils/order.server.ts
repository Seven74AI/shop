import { invariant } from '@epic-web/invariant'
import { type OrderStatus, type Prisma } from '@prisma/client'
import * as Sentry from '@sentry/react-router'
import type Stripe from 'stripe'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { getDomainUrl } from './misc.tsx'
import { generateOrderNumber } from './order-number.server.ts'
import { generateInvoiceNumber, parseInvoiceNumber, formatInvoiceNumber } from './invoice.server.ts'
import { stripe } from './stripe.server.ts'
import { calculateVat, type TaxableItem } from './tax.server.ts'
import { issueCreditNote, type RefundedLineItem } from './invoice.server.ts'
import {
	generateInvoicePdf,
	type InvoicePdfData,
} from './invoice-pdf.server.tsx'
import { getReturnRequestById } from './return-queries.server.ts'
import { updateReturnStatus } from './return.server.ts'

/**
 * Type for stock availability issues
 */
export type StockIssue = {
	productName: string
	requested: number
	available: number
}

export class StockValidationError extends Error {
	constructor(public issues: StockIssue[]) {
		super('Insufficient stock for one or more items')
		this.name = 'StockValidationError'
	}
}

export class StockUnavailableError extends Error {
	constructor(public data: StockIssue) {
		super(`Insufficient stock for ${data.productName}`)
		this.name = 'StockUnavailableError'
	}
}

/**
 * Validates that all items in the cart have sufficient stock availability.
 * Checks variant-level stock when variant exists, product-level stock when no variant.
 * @param cartId - The ID of the cart to validate
 * @throws StockValidationError if any items have insufficient stock
 */
export async function validateStockAvailability(cartId: string): Promise<void> {
	const cart = await prisma.cart.findUnique({
		where: { id: cartId },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							stockQuantity: true,
						},
					},
				},
			},
		},
	})

	invariant(cart, 'Cart not found')
	invariant(cart.items.length > 0, 'Cart is empty')

	const stockIssues: StockIssue[] = []

	for (const item of cart.items) {
		if (item.variantId) {
			// Item has variant - check variant-level stock
			const variant = await prisma.productVariant.findUnique({
				where: { id: item.variantId },
				select: { id: true, stockQuantity: true },
			})

			invariant(
				variant,
				`Variant ${item.variantId} not found for product ${item.product.name}`,
			)

			if (variant.stockQuantity < item.quantity) {
				stockIssues.push({
					productName: item.product.name,
					requested: item.quantity,
					available: variant.stockQuantity,
				})
			}
		} else {
			// Item has no variant - check product-level stock
			if (item.product.stockQuantity !== null) {
				// Product has stock tracking
				if (item.product.stockQuantity < item.quantity) {
					stockIssues.push({
						productName: item.product.name,
						requested: item.quantity,
						available: item.product.stockQuantity,
					})
				}
			}
			// If stockQuantity is null, treat as unlimited (no validation)
		}
	}

	if (stockIssues.length > 0) {
		throw new StockValidationError(stockIssues)
	}
}

/**
 * Gets an order by ID with full details including items, products, and variants.
 */
export async function getOrderById(orderId: string) {
	return prisma.order.findUnique({
		where: { id: orderId },
		include: {
			user: {
				select: {
					id: true,
					email: true,
					username: true,
					name: true,
				},
			},
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							slug: true,
							images: {
								select: {
									objectKey: true,
									altText: true,
								},
								orderBy: { displayOrder: 'asc' },
								take: 1,
							},
						},
					},
					variant: {
						include: {
							attributeValues: {
								include: {
									attributeValue: {
										include: {
											attribute: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

/**
 * Gets an order by order number.
 */
export async function getOrderByOrderNumber(orderNumber: string) {
	return prisma.order.findUnique({
		where: { orderNumber },
		include: {
			user: {
				select: {
					id: true,
					email: true,
					username: true,
					name: true,
				},
			},
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							slug: true,
							images: {
								select: {
									objectKey: true,
									altText: true,
								},
								orderBy: { displayOrder: 'asc' },
								take: 1,
							},
						},
					},
					variant: {
						include: {
							attributeValues: {
								include: {
									attributeValue: {
										include: {
											attribute: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

/**
 * Gets all orders for a user, ordered by most recent first.
 */
export async function getUserOrders(userId: string) {
	return prisma.order.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		include: {
			items: {
				include: {
					product: {
						select: {
							name: true,
							slug: true,
							images: {
								select: {
									objectKey: true,
									altText: true,
								},
								orderBy: { displayOrder: 'asc' },
								take: 1,
							},
						},
					},
				},
			},
		},
	})
}

/**
 * Gets a guest order by order number and email for security.
 */
export async function getGuestOrder(orderNumber: string, email: string) {
	const order = await getOrderByOrderNumber(orderNumber)

	if (!order) {
		return null
	}

	// Verify email matches for security
	if (order.email.toLowerCase() !== email.toLowerCase()) {
		return null
	}

	// Only return guest orders (no userId)
	if (order.userId) {
		return null
	}

	return order
}

/**
 * Updates an order status (admin only) and sends email notification.
 * @param orderId - The ID of the order to update
 * @param status - The new status
 * @param request - Optional request object for getting domain URL (for email links)
 * @param trackingNumber - Optional tracking number (required when status is SHIPPED)
 */
export async function updateOrderStatus(
	orderId: string,
	status: OrderStatus,
	request?: Request,
	trackingNumber?: string | null,
): Promise<void> {
	// Update order status and tracking number
	const order = await prisma.order.update({
		where: { id: orderId },
		data: {
			status,
			// Always update trackingNumber when status is SHIPPED (even if it's empty string/null)
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
		},
	})

	// Send status update email (non-blocking - don't fail status update if email fails)
	try {
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
		const statusLabel = getStatusLabel(status)
		
		let emailBody = `
			<h1>Order Status Update</h1>
			<p>Your order status has been updated.</p>
			<p><strong>Order Number:</strong> ${order.orderNumber}</p>
			<p><strong>New Status:</strong> ${statusLabel}</p>
		`
		
		if (status === 'SHIPPED' && order.trackingNumber) {
			emailBody += `<p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>`
		}
		
		emailBody += `<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>`
		
		let textBody = `
Order Status Update

Your order status has been updated.

Order Number: ${order.orderNumber}
New Status: ${statusLabel}
`
		
		if (status === 'SHIPPED' && order.trackingNumber) {
			textBody += `Tracking Number: ${order.trackingNumber}\n`
		}
		
		textBody += `View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}`
		
		await sendEmail({
			to: order.email,
			subject: `Order Status Update - ${order.orderNumber}`,
			html: emailBody,
			text: textBody,
		})
	} catch (emailError) {
		// Log email error but don't fail status update
		// Status was successfully updated, email is secondary
		Sentry.captureException(emailError, {
			tags: { context: 'order-status-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}
}

/**
 * Gets a human-readable label for order status.
 */
function getStatusLabel(status: OrderStatus): string {
	switch (status) {
		case 'PENDING':
			return 'Pending'
		case 'CONFIRMED':
			return 'Confirmed'
		case 'SHIPPED':
			return 'Shipped'
		case 'DELIVERED':
			return 'Delivered'
		case 'CANCELLED':
			return 'Cancelled'
		default:
			return status
	}
}

/**
 * Cancels an order and creates a Stripe refund (admin only).
 * @param orderId - The ID of the order to cancel
 * @param request - Optional request object for getting domain URL (for email links)
 */
export async function cancelOrder(
	orderId: string,
	request?: Request,
	refundAmountCents?: number,
): Promise<void> {
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
			subtotal: true,
			shippingCost: true,
			shippingName: true,
			shippingStreet: true,
			shippingCity: true,
			shippingPostal: true,
			shippingCountry: true,
			createdAt: true,
			items: {
				include: {
					product: { select: { name: true } },
					variant: {
						select: { id: true, sku: true },
					},
				},
			},
			invoices: {
				where: { kind: 'INVOICE' },
				take: 1,
				orderBy: { createdAt: 'desc' },
			},
		},
	})

	invariant(order, 'Order not found')
	invariant(order.status !== 'CANCELLED', 'Order is already cancelled')

	// Create refund via Stripe if payment was processed
	let refundId: string | null = null
	if (order.stripePaymentIntentId || order.stripeChargeId) {
		try {
			const refundAmount = refundAmountCents ?? order.total
			const refundParams: Stripe.RefundCreateParams = {
				amount: refundAmount,
				reason: 'requested_by_customer',
				metadata: {
					orderNumber: order.orderNumber,
					cancelledBy: 'admin',
				},
			}

			// Use payment_intent if available, otherwise use charge
			if (order.stripePaymentIntentId) {
				refundParams.payment_intent = order.stripePaymentIntentId
			} else if (order.stripeChargeId) {
				refundParams.charge = order.stripeChargeId
			}

			const refund = await stripe.refunds.create(refundParams)
			refundId = refund.id
		} catch (refundError) {
			// Log refund error but don't fail order cancellation
			// Admin can manually process refund if needed
			Sentry.captureException(refundError, {
				tags: { context: 'order-cancellation-refund' },
				extra: { orderNumber: order.orderNumber },
			})
			// Still proceed with order cancellation
		}
	}

	// Update order status to CANCELLED
	await prisma.order.update({
		where: { id: orderId },
		data: { status: 'CANCELLED' },
	})

	// Send cancellation email with credit note PDF if available (non-blocking)
	try {
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'

		// Attempt to generate credit note PDF for email attachment
		let creditNotePdfBuffer: Buffer | null = null
		let creditNoteNumber: string | null = null

		const parentInvoice = order.invoices[0]
		if (parentInvoice && order.items.length > 0) {
			try {
				// Build refunded line items from order items
				const refundedItems: RefundedLineItem[] = order.items.map((oi) => ({
					description:
						oi.variant?.sku ?? oi.product.name,
					quantity: oi.quantity,
					unitPriceCents: oi.price,
					totalCents: oi.price * oi.quantity,
				}))

				const refundedShippingCents = order.shippingCost ?? 0

				// Issue credit note (shared gapless sequence)
				const creditNote = await issueCreditNote(
					parentInvoice.id,
					refundedItems,
					refundedShippingCents,
				)

				creditNoteNumber = creditNote.number

				// Format parent invoice number
				const parentInvoiceNumber = `F${parentInvoice.fiscalYear}-${String(parentInvoice.sequence).padStart(5, '0')}`

				// Generate PDF for the credit note
				const pdfData: InvoicePdfData = {
					kind: 'CREDIT_NOTE',
					invoiceNumber: creditNote.number,
					parentInvoiceNumber,
					invoiceDate: new Date().toLocaleDateString('fr-FR'),
					invoiceStatus: 'FINAL',
					orderNumber: order.orderNumber,
					orderDate: order.createdAt.toLocaleDateString('fr-FR'),
					customer: {
						name: order.shippingName,
						email: order.email,
						company: null,
						vatNumber: null,
					},
					shipping: {
						name: order.shippingName,
						street: order.shippingStreet,
						city: order.shippingCity,
						postal: order.shippingPostal,
						country: order.shippingCountry,
					},
					items: refundedItems.map((item) => ({
						description: item.description,
						quantity: -item.quantity,
						unitPriceCents: item.unitPriceCents,
						totalCents: -item.totalCents,
					})),
					subtotalCents: -order.subtotal,
					vatBreakdown: [],
					vatTotalCents: 0,
					shippingCostCents: -(order.shippingCost ?? 0),
					totalCents: -order.total,
					currency: { symbol: '€', code: 'EUR', decimals: 2 },
					storeName: 'Epic Shop',
					storeAddress: '123 Epic Street, 75001 Paris, France',
					storeVatNumber: 'FR12345678901',
					storeEmail: 'support@epicstack.dev',
				}

				creditNotePdfBuffer = await generateInvoicePdf(pdfData)
			} catch (creditNoteError) {
				// Log credit note error but don't fail cancellation
				Sentry.captureException(creditNoteError, {
					tags: { context: 'order-cancellation-credit-note' },
					extra: { orderNumber: order.orderNumber },
				})
			}
		}

		await sendEmail({
			to: order.email,
			subject: `Order Cancelled - ${order.orderNumber}`,
			html: `
				<h1>Order Cancelled</h1>
				<p>Your order has been cancelled.</p>
				<p><strong>Order Number:</strong> ${order.orderNumber}</p>
				${refundId ? `<p><strong>Refund ID:</strong> ${refundId}</p>` : ''}
				${creditNoteNumber ? `<p><strong>Credit Note:</strong> ${creditNoteNumber}</p>` : ''}
				<p>${refundId ? 'A refund has been processed and will appear in your account within 5-10 business days.' : 'If you have already been charged, please contact support for a refund.'}</p>
				<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>
			`,
			text: `
Order Cancelled

Your order has been cancelled.

Order Number: ${order.orderNumber}
${refundId ? `Refund ID: ${refundId}` : ''}
${creditNoteNumber ? `Credit Note: ${creditNoteNumber}` : ''}
${refundId ? 'A refund has been processed and will appear in your account within 5-10 business days.' : 'If you have already been charged, please contact support for a refund.'}

View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}
			`,
			...(creditNotePdfBuffer
				? {
						attachments: [
							{
								content: creditNotePdfBuffer,
								filename: `Avoir-${creditNoteNumber ?? 'credit-note'}.pdf`,
							},
						],
					}
				: {}),
		})
	} catch (emailError) {
		// Log email error but don't fail cancellation
		Sentry.captureException(emailError, {
			tags: { context: 'order-cancellation-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}
}

/**
 * Gets an order by checkout session ID (for webhook idempotency).
 */
export async function getOrderByCheckoutSessionId(
	checkoutSessionId: string,
) {
	return prisma.order.findUnique({
		where: { stripeCheckoutSessionId: checkoutSessionId },
		include: {
			items: {
				include: {
					product: true,
					variant: true,
				},
			},
		},
	})
}

/**
 * Creates an order from a Stripe checkout session.
 * This function handles the complete order creation process including:
 * - Payment status verification
 * - Idempotency checking
 * - Stock validation
 * - Atomic order creation with stock reduction and cart deletion
 * 
 * @param sessionId - The Stripe checkout session ID
 * @param fullSession - Optional pre-retrieved session (to avoid duplicate API calls)
 * @param request - Optional request object for getting domain URL (for email links)
 * @returns The created or existing order
 * @throws StockUnavailableError if stock is insufficient
 */
export async function createOrderFromStripeSession(
	sessionId: string,
	fullSession?: Stripe.Checkout.Session,
	request?: Request,
): Promise<{ id: string; orderNumber: string }> {
	// Idempotency check - prevent duplicate order creation
	const existingOrder = await getOrderByCheckoutSessionId(sessionId)
	if (existingOrder) {
		// Order already exists - ensure cart is deleted (idempotent operation)
		// This handles webhook retries and ensures cart is cleaned up even if
		// the first call deleted the cart but a retry comes in
		const session = fullSession || await stripe.checkout.sessions.retrieve(sessionId)
		const cartId = session.metadata?.cartId
		if (cartId) {
			try {
				// Try to delete cart items first, then cart
				await prisma.cartItem.deleteMany({
					where: { cartId },
				})
				await prisma.cart.delete({
					where: { id: cartId },
				}).catch(() => {
					// Cart might already be deleted - that's fine
				})
			} catch {
				// Cart might already be deleted or not exist - that's fine
				// This is idempotent - we don't want to fail if cart is already gone
			}
		}
		return { id: existingOrder.id, orderNumber: existingOrder.orderNumber }
	}

	// Retrieve full session from Stripe with expanded data if not provided
	const session = fullSession || await stripe.checkout.sessions.retrieve(sessionId, {
		expand: ['line_items', 'payment_intent'],
	})

	// Verify payment status before fulfilling order
	if (session.payment_status !== 'paid') {
		throw new Error(
			`Payment not completed for session ${sessionId}. Payment status: ${session.payment_status}`,
		)
	}

	// Extract metadata
	const cartId = session.metadata?.cartId
	const userId = session.metadata?.userId || null
	invariant(cartId, 'Missing cartId in session metadata')

	// Load cart data BEFORE transaction (more efficient)
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
							taxKind: true,
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

	// Create order in transaction
	const order = await prisma.$transaction(
		async (tx) => {
			// 1. Re-check stock (final validation, handles race conditions)
			for (const item of cart.items) {
				if (item.variantId && item.variant) {
					// Item has variant - check variant-level stock
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
					// Item has no variant - check product-level stock
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

			// 2. Reduce stock atomically
			for (const item of cart.items) {
				if (item.variantId) {
					// Reduce variant stock
					await tx.productVariant.update({
						where: { id: item.variantId },
						data: { stockQuantity: { decrement: item.quantity } },
					})
				} else {
					// Reduce product stock (if it has stock tracking)
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

			// 3. Generate order number (using existing transaction)
			const orderNumber = await generateOrderNumber(tx)

			// 4. Create order
			const paymentIntentId =
				typeof session.payment_intent === 'string'
					? session.payment_intent
					: session.payment_intent?.id || null

			// Get payment intent to extract charge ID
			let chargeId: string | null = null
			if (paymentIntentId) {
				try {
					const paymentIntent = await stripe.paymentIntents.retrieve(
						paymentIntentId,
					)
					if (typeof paymentIntent.latest_charge === 'string') {
						chargeId = paymentIntent.latest_charge
					}
				} catch (err) {
					// Log but don't fail order creation if charge retrieval fails
					Sentry.captureException(err, {
						tags: { context: 'order-charge-retrieval' },
						extra: { paymentIntentId },
					})
				}
			}

			// Extract shipping information from metadata
			const shippingMethodId = session.metadata?.shippingMethodId || null
			const shippingCost = session.metadata?.shippingCost
				? parseInt(session.metadata.shippingCost, 10)
				: 0
			const mondialRelayPickupPointId =
				session.metadata?.mondialRelayPickupPointId || null

			// Get shipping method details if available
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

			// Calculate subtotal (total - shipping)
			const calculatedSubtotal = (session.amount_subtotal ?? 0) - shippingCost

			// Calculate VAT for the order
			const shippingCountry = session.metadata?.shippingCountry || 'US'
			const customerVatNumber = session.metadata?.customerVatNumber || null

			// Build taxable items from cart
			const taxableItems: TaxableItem[] = cart.items.map((item) => ({
				priceCents:
					item.variantId && item.variant
						? item.variant.price ?? item.product.price
						: item.product.price,
				quantity: item.quantity,
				taxKind: item.product.taxKind,
			}))

			// Calculate VAT (separate DB read - TaxRate table is read-only, not part of transaction)
			const vatCalculation = await calculateVat(
				taxableItems,
				shippingCountry,
				customerVatNumber,
			)

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
					shippingCountry,
					shippingMethodId,
					shippingCost,
					shippingMethodName,
					shippingCarrierName,
					mondialRelayPickupPointId,
					mondialRelayPickupPointName,
					// VAT data
					vatBreakdown: vatCalculation.breakdown as any,
					vatTotalCents: vatCalculation.totalVatCents,
					taxCountry: vatCalculation.taxCountry,
					customerVatNumber,
					vatValidationStatus: 'UNCHECKED',
					stripeCheckoutSessionId: session.id,
					stripePaymentIntentId: paymentIntentId,
					stripeChargeId: chargeId,
					status: 'CONFIRMED',
				},
			})

			// 5. Create order items
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

			// 6. Create invoice for the order (within transaction for atomicity)
			await createInvoiceForOrder(tx, newOrder.id, calculatedSubtotal, newOrder.total, vatCalculation)

			// 7. Delete cart items (within transaction for atomicity)
			await tx.cartItem.deleteMany({
				where: { cartId },
			})

			// 8. Delete cart (within transaction for atomicity)
			await tx.cart.delete({
				where: { id: cartId },
			})

			return newOrder
		},
		{
			timeout: 30000, // 30 second timeout
		},
	)

	// Send confirmation email (non-blocking - don't fail order creation if email fails)
	try {
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
		
		// Build VAT details for email
		let vatHtml = ''
		let vatText = ''
		if (order.vatTotalCents > 0 && order.vatBreakdown) {
			const breakdown = typeof order.vatBreakdown === 'string'
				? JSON.parse(order.vatBreakdown)
				: order.vatBreakdown
			if (Array.isArray(breakdown)) {
				for (const line of breakdown as Array<{ kind: string; rate: number; vatCents: number }>) {
					const pct = (line.rate / 100).toFixed(1)
					vatHtml += `<p><strong>VAT (${line.kind} ${pct}%):</strong> €${(line.vatCents / 100).toFixed(2)}</p>\n`
					vatText += `VAT (${line.kind} ${pct}%): €${(line.vatCents / 100).toFixed(2)}\n`
				}
			}
		}
		
		await sendEmail({
			to: order.email,
			subject: `Order Confirmation - ${order.orderNumber}`,
			html: `
				<h1>Order Confirmation</h1>
				<p>Thank you for your order!</p>
				<p><strong>Order Number:</strong> ${order.orderNumber}</p>
				<p><strong>Subtotal:</strong> €${(order.subtotal / 100).toFixed(2)}</p>
				${vatHtml}
				<p><strong>Total:</strong> €${(order.total / 100).toFixed(2)}</p>
				<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>
			`,
			text: `
Order Confirmation

Thank you for your order!

Order Number: ${order.orderNumber}
Subtotal: €${(order.subtotal / 100).toFixed(2)}
${vatText}
Total: €${(order.total / 100).toFixed(2)}

View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}
			`,
		})
	} catch (emailError) {
		// Log email error but don't fail order creation
		Sentry.captureException(emailError, {
			tags: { context: 'order-confirmation-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}

	return { id: order.id, orderNumber: order.orderNumber }
}

/**
 * Processes a refund for a return request — calls Stripe, issues a credit note,
 * updates the return status to REFUNDED, and sends a confirmation email.
 *
 * Idempotency: if the return is already REFUNDED, this is a no-op (safeguard
 * against double-clicks until Stripe idempotency keys land in P2.1).
 *
 * @param returnRequestId - The ID of the ReturnRequest to refund.
 * @param request - Optional request object for domain URL (email links).
 * @returns The Stripe refund ID and credit note number.
 */
export async function processReturnRefund(
	returnRequestId: string,
	request?: Request,
): Promise<{ refundId: string | null; creditNoteNumber: string | null }> {
	const returnRequest = await getReturnRequestById(returnRequestId)

	invariant(returnRequest, 'Return request not found')

	// Idempotency: if already refunded, don't process again
	if (returnRequest.status === 'REFUNDED') {
		return {
			refundId: null,
			creditNoteNumber: null,
		}
	}

	// Validate status transition BEFORE Stripe refund — prevents processing
	// a refund when the return is not in RECEIVED state, which would leave
	// money refunded without the return being marked as REFUNDED.
	if (returnRequest.status !== 'RECEIVED') {
		throw new Response(
			`Invalid status transition: ${returnRequest.status} → REFUNDED`,
			{ status: 400 },
		)
	}

	const order = await prisma.order.findUnique({
		where: { id: returnRequest.orderId },
		select: {
			id: true,
			orderNumber: true,
			email: true,
			stripePaymentIntentId: true,
			stripeChargeId: true,
			shippingName: true,
			shippingStreet: true,
			shippingCity: true,
			shippingPostal: true,
			shippingCountry: true,
			createdAt: true,
		},
	})

	invariant(order, 'Order not found for return request')

	// Compute refund amount from returned items
	let itemRefundCents = 0
	const refundedItems: RefundedLineItem[] = []

	for (const returnItem of returnRequest.items) {
		const oi = returnItem.orderItem
		if (!oi) continue

		const unitPriceCents = oi.price
		const lineRefundCents = unitPriceCents * returnItem.quantity
		itemRefundCents += lineRefundCents

		refundedItems.push({
			description: oi.product?.name ?? `Item ${oi.id}`,
			quantity: returnItem.quantity,
			unitPriceCents,
			totalCents: lineRefundCents,
		})
	}

	// Apply restocking fee if set (reduces the refund)
	const restockingFee = returnRequest.restockingFeeCents ?? 0
	const shippingRefundCents = 0 // Shipping is not refunded for partial returns
	const refundAmountCents = itemRefundCents - restockingFee

	invariant(refundAmountCents > 0, 'Refund amount must be positive')

	// Process Stripe refund
	let refundId: string | null = null
	if (order.stripePaymentIntentId || order.stripeChargeId) {
		try {
			const refundParams: Stripe.RefundCreateParams = {
				amount: refundAmountCents,
				reason: 'requested_by_customer',
				metadata: {
					orderNumber: order.orderNumber,
					returnRequestId: returnRequest.id,
					returnedBy: 'admin',
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
				tags: { context: 'return-refund-stripe' },
				extra: {
					orderNumber: order.orderNumber,
					returnRequestId: returnRequest.id,
				},
			})
			throw refundError
		}
	}

	// Update return status to REFUNDED
	await updateReturnStatus(
		returnRequestId,
		'REFUNDED',
		null,
		refundAmountCents,
		restockingFee > 0 ? restockingFee : null,
	)

	// Issue credit note
	let creditNoteNumber: string | null = null
	let creditNotePdfBuffer: Buffer | null = null

	try {
		// Find parent invoice for the order
		const parentInvoice = await prisma.invoice.findFirst({
			where: { orderId: order.id, kind: 'INVOICE' },
			orderBy: { createdAt: 'desc' },
		})

		if (parentInvoice && refundedItems.length > 0) {
			const creditNote = await issueCreditNote(
				parentInvoice.id,
				refundedItems,
				shippingRefundCents,
			)

			creditNoteNumber = creditNote.number

			// Generate PDF for credit note
			const parentInvoiceNumber = `F${parentInvoice.fiscalYear}-${String(parentInvoice.sequence).padStart(5, '0')}`

			const pdfData: InvoicePdfData = {
				kind: 'CREDIT_NOTE',
				invoiceNumber: creditNote.number,
				parentInvoiceNumber,
				invoiceDate: new Date().toLocaleDateString('fr-FR'),
				invoiceStatus: 'FINAL',
				orderNumber: order.orderNumber,
				orderDate: new Date(order.createdAt).toLocaleDateString('fr-FR'),
				customer: {
					name: order.shippingName,
					email: order.email,
					company: null,
					vatNumber: null,
				},
				shipping: {
					name: order.shippingName,
					street: order.shippingStreet,
					city: order.shippingCity,
					postal: order.shippingPostal,
					country: order.shippingCountry,
				},
				items: refundedItems.map((item) => ({
					description: item.description,
					quantity: -item.quantity,
					unitPriceCents: item.unitPriceCents,
					totalCents: -item.totalCents,
				})),
				subtotalCents: -itemRefundCents,
				vatBreakdown: [],
				vatTotalCents: 0,
				shippingCostCents: -shippingRefundCents,
				totalCents: -(itemRefundCents - restockingFee),
				currency: { symbol: '€', code: 'EUR', decimals: 2 },
				storeName: 'Epic Shop',
				storeAddress: '123 Epic Street, 75001 Paris, France',
				storeVatNumber: 'FR12345678901',
				storeEmail: 'support@epicstack.dev',
			}

			creditNotePdfBuffer = await generateInvoicePdf(pdfData)
		}
	} catch (creditNoteError) {
		// Log credit note error but don't fail refund — the Stripe refund
		// and status update have already succeeded.
		Sentry.captureException(creditNoteError, {
			tags: { context: 'return-refund-credit-note' },
			extra: {
				orderNumber: order.orderNumber,
				returnRequestId: returnRequest.id,
			},
		})
	}

	// Send refund confirmation email (non-blocking)
	try {
		const domainUrl = request
			? getDomainUrl(request)
			: 'http://localhost:3000'

		const restockingLine = restockingFee > 0
			? `<p><strong>Restocking Fee:</strong> €${(restockingFee / 100).toFixed(2)}</p>`
			: ''

		await sendEmail({
			to: order.email,
			subject: `Refund Processed — Order ${order.orderNumber}`,
			html: `
				<h1>Refund Processed</h1>
				<p>A refund has been processed for your return.</p>
				<p><strong>Order Number:</strong> ${order.orderNumber}</p>
				<p><strong>Refund Amount:</strong> €${(refundAmountCents / 100).toFixed(2)}</p>
				${restockingLine}
				${refundId ? `<p><strong>Refund ID:</strong> ${refundId}</p>` : ''}
				${creditNoteNumber ? `<p><strong>Credit Note:</strong> ${creditNoteNumber}</p>` : ''}
				<p>The refund will appear in your account within 5-10 business days.</p>
				<p><a href="${domainUrl}/account/returns/${returnRequest.id}">View Return Details</a></p>
			`,
			text: `
Refund Processed

A refund has been processed for your return.

Order Number: ${order.orderNumber}
Refund Amount: €${(refundAmountCents / 100).toFixed(2)}
${restockingFee > 0 ? `Restocking Fee: €${(restockingFee / 100).toFixed(2)}\n` : ''}
${refundId ? `Refund ID: ${refundId}\n` : ''}
${creditNoteNumber ? `Credit Note: ${creditNoteNumber}\n` : ''}

The refund will appear in your account within 5-10 business days.

View Return Details: ${domainUrl}/account/returns/${returnRequest.id}
			`,
			...(creditNotePdfBuffer
				? {
						attachments: [
							{
								content: creditNotePdfBuffer,
								filename: `Avoir-${creditNoteNumber ?? 'credit-note'}.pdf`,
							},
						],
					}
				: {}),
		})
	} catch (emailError) {
		// Log email error but don't fail refund
		Sentry.captureException(emailError, {
			tags: { context: 'return-refund-email' },
			extra: {
				orderNumber: order.orderNumber,
				returnRequestId: returnRequest.id,
			},
		})
	}

	return { refundId, creditNoteNumber }
}

/**
 * Creates an Invoice record for an order within a transaction.
 * Generates a sequential fiscal-year invoice number using the existing transaction
 * and snapshots the order's financial data (subtotal, total, VAT breakdown) into
 * the Invoice record. The invoice is created in DRAFT status.
 *
 * Idempotent: if an invoice already exists for this order, returns the existing one.
 * Must be called within a Prisma transaction.
 *
 * @param tx - The Prisma transaction client
 * @param orderId - The ID of the order to invoice
 * @param subtotalCents - Order subtotal in cents
 * @param totalCents - Order total in cents
 * @param vatCalculation - VAT calculation result from tax.server.ts
 * @returns The created or existing invoice
 */
export async function createInvoiceForOrder(
	tx: Prisma.TransactionClient,
	orderId: string,
	subtotalCents: number,
	totalCents: number,
	vatCalculation: { breakdown: Array<{ kind: string; rate: number; baseCents: number; vatCents: number }>; totalVatCents: number; taxCountry: string | null },
): Promise<{ id: string; invoiceNumber: string }> {
	// Idempotency check — if an invoice already exists for this order, return it
	const existingInvoice = await tx.invoice.findFirst({
		where: { orderId, kind: 'INVOICE' },
		select: { id: true, fiscalYear: true, sequence: true },
	})
	if (existingInvoice) {
		const num = formatInvoiceNumber(existingInvoice.fiscalYear, existingInvoice.sequence)
		return { id: existingInvoice.id, invoiceNumber: num }
	}

	// Determine fiscal year from current date
	const fiscalYear = new Date().getFullYear()

	// Generate invoice number within the transaction
	const invoiceNumber = await generateInvoiceNumber(fiscalYear, tx)

	// Extract sequence from the generated number
	const parsed = parseInvoiceNumber(invoiceNumber)
	if (!parsed) {
		throw new Error(`Invalid generated invoice number: ${invoiceNumber}`)
	}

	// Build VAT breakdown from the vatCalculation result (snapshot at invoice time)
	const vatBreakdown = vatCalculation.breakdown.map((line) => ({
		kind: line.kind,
		rate: line.rate,
		baseCents: line.baseCents,
		vatCents: line.vatCents,
	}))

	const invoice = await tx.invoice.create({
		data: {
			fiscalYear,
			sequence: parsed.sequence,
			kind: 'INVOICE',
			orderId,
			subtotalCents,
			totalCents,
			vatBreakdown,
			vatTotalCents: vatCalculation.totalVatCents,
			status: 'DRAFT',
		},
	})

	return { id: invoice.id, invoiceNumber }
}

