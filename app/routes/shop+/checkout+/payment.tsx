import { invariantResponse } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { useEffect } from 'react'
import { data, Link, redirect, redirectDocument, useActionData, useLoaderData } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { getCheckoutData, calculateCartVat } from '#app/utils/checkout.server.ts'
import { validateCoupon, incrementCouponUsedCount } from '#app/utils/coupon.server.ts'
import { computeDiscountAmount, couponErrorMessages } from '#app/schemas/coupon.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import {
	generateCheckoutKey,
	IdempotencyConflictError,
	withIdempotency,
} from '#app/utils/idempotency.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import {
	StockValidationError,
	validateStockAvailability,
} from '#app/utils/order-stock.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { createCheckoutSession, handleStripeError } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/payment.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)

	// Get shipping data from URL params
	const name = url.searchParams.get('name')
	const email = url.searchParams.get('email')
	const street = url.searchParams.get('street')
	const city = url.searchParams.get('city')
	const state = url.searchParams.get('state')
	const postal = url.searchParams.get('postal')
	const country = url.searchParams.get('country')
	const shippingMethodId = url.searchParams.get('shippingMethodId')
	const shippingCostParam = url.searchParams.get('shippingCost')
	const mondialRelayPickupPointId = url.searchParams.get('mondialRelayPickupPointId')

	// Validate required fields
	if (!name || !email || !street || !city || !postal || !country || !shippingMethodId || !shippingCostParam) {
		return redirect('/shop/checkout/delivery')
	}

	const shippingCost = parseInt(shippingCostParam, 10)
	if (isNaN(shippingCost)) {
		return redirect('/shop/checkout/delivery')
	}

	const checkoutData = await getCheckoutData(request)
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	// Calculate VAT for display
	const customerVatNumber = url.searchParams.get('customerVatNumber') || undefined
	let vatCalculation = null
	try {
		vatCalculation = await calculateCartVat(
			checkoutData.cart,
			country,
			customerVatNumber,
		)
	} catch {
		// VAT calculation failure shouldn't block checkout
	}

	// Get coupon code from URL params for review/display
	const couponCode = url.searchParams.get('couponCode') || undefined

	// If coupon code is present, validate and compute discount preview
	let couponDiscount: { discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; discountValue: number; discountCents: number; couponCode: string } | null = null
	if (couponCode) {
		const result = await validateCoupon(couponCode, checkoutData.subtotal)
		if (result.valid) {
			const discountCents = computeDiscountAmount(
				result.discountType,
				result.discountValue,
				checkoutData.subtotal,
			)
			couponDiscount = {
				discountType: result.discountType,
				discountValue: result.discountValue,
				discountCents,
				couponCode: result.couponCode,
			}
		}
	}

	const preDiscountTotal = checkoutData.subtotal + shippingCost + (vatCalculation?.totalVatCents ?? 0)
	const couponDiscountCents = couponDiscount?.discountCents ?? 0

	return {
		...checkoutData,
		shippingInfo: {
			name,
			email,
			street,
			city,
			state: state || undefined,
			postal,
			country,
		},
		shippingMethodId,
		shippingCost,
		mondialRelayPickupPointId: mondialRelayPickupPointId || undefined,
		vatCalculation,
		couponCode,
		couponDiscount,
		couponDiscountCents,
		preDiscountTotal,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const url = new URL(request.url)

	// Get shipping data from URL params
	const name = url.searchParams.get('name')
	const email = url.searchParams.get('email')
	const street = url.searchParams.get('street')
	const city = url.searchParams.get('city')
	const state = url.searchParams.get('state')
	const postal = url.searchParams.get('postal')
	const country = url.searchParams.get('country')
	const shippingMethodId = url.searchParams.get('shippingMethodId')
	const shippingCostParam = url.searchParams.get('shippingCost')
	const mondialRelayPickupPointId = url.searchParams.get('mondialRelayPickupPointId')

	// Validate required fields
	if (!name || !email || !street || !city || !postal || !country || !shippingMethodId || !shippingCostParam) {
		return redirect('/shop/checkout/delivery')
	}

	const shippingCost = parseInt(shippingCostParam, 10)
	if (isNaN(shippingCost)) {
		return redirect('/shop/checkout/delivery')
	}

	// Get cart
	const { cart } = await getOrCreateCartFromRequest(request)
	invariantResponse(cart, 'Cart not found', { status: 404 })
	invariantResponse(cart.items.length > 0, 'Cart is empty', { status: 400 })

	// Validate stock availability
	try {
		await validateStockAvailability(cart.id)
	} catch (error) {
		if (error instanceof StockValidationError) {
			const stockMessages = error.issues.map(
				(issue) =>
					`${issue.productName}: Only ${issue.available} available, ${issue.requested} requested`,
			)
			return data(
				{
					error: 'Insufficient stock',
					messages: stockMessages,
				},
				{ status: 400 },
			)
		}
		Sentry.captureException(error, {
			tags: { context: 'checkout-stock-validation' },
		})
		throw error
	}

	// Get cart with full product details including taxKind for VAT calculation
	const cartWithItems = await prisma.cart.findUnique({
		where: { id: cart.id },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							description: true,
							price: true,
							taxKind: true,
							weightGrams: true,
						},
					},
					variant: {
						select: {
							id: true,
							price: true,
							sku: true,
							weightGrams: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(cartWithItems, 'Cart not found', { status: 404 })

	const currency = await getStoreCurrency()
	invariantResponse(currency, 'Currency not configured', { status: 500 })

	const userId = await getUserId(request)

	// Calculate cart subtotal (before any discounts)
	const subtotal = cartWithItems.items.reduce((sum, item) => {
		const price = item.variant?.price ?? item.product.price
		return sum + (price ?? 0) * item.quantity
	}, 0)

	// Validate coupon code if present
	const couponCode = url.searchParams.get('couponCode') || undefined
	let couponValidation: { discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; discountValue: number; discountCents: number; couponId: string; couponCode: string } | null = null

	if (couponCode) {
		const result = await validateCoupon(couponCode, subtotal, userId)

		if (!result.valid) {
			return data(
				{
					error: 'Invalid coupon',
					message: couponErrorMessages[result.reason],
				},
				{ status: 400 },
			)
		}

		const discountCents = computeDiscountAmount(
			result.discountType,
			result.discountValue,
			subtotal,
		)
		couponValidation = {
			discountType: result.discountType,
			discountValue: result.discountValue,
			discountCents,
			couponId: result.couponId,
			couponCode: result.couponCode,
		}
	}

	// Calculate VAT for the order
	const customerVatNumber = url.searchParams.get('customerVatNumber') || undefined
	let vatCalculation = null
	try {
		vatCalculation = await calculateCartVat(
			cartWithItems as any,
			country,
			customerVatNumber,
		)
	} catch (vatErr) {
		Sentry.captureException(vatErr, {
			tags: { context: 'checkout-vat-calculation' },
		})
		// Continue without VAT on calculation failure
	}

	// Create Stripe Checkout Session with idempotency protection
	try {
		const domainUrl = getDomainUrl(request)
		const checkoutKey = generateCheckoutKey(cartWithItems.id)

		const session = await withIdempotency(
			checkoutKey,
			'checkout_session',
			async (stripeIdempotencyKey) => {
				return createCheckoutSession({
					cart: cartWithItems,
					shippingInfo: {
						name,
						email,
						street,
						city,
						state: state || undefined,
						postal,
						country,
					},
					shippingMethodId,
					shippingCost,
					mondialRelayPickupPointId: mondialRelayPickupPointId || undefined,
					customerVatNumber,
					currency,
					domainUrl,
					userId: userId || undefined,
					vatTotalCents: vatCalculation?.totalVatCents ?? 0,
					vatBreakdown: vatCalculation?.breakdown ?? [],
					idempotencyKey: stripeIdempotencyKey,
					couponDiscountCents: couponValidation?.discountCents ?? 0,
					couponCode: couponValidation?.couponCode,
				})
			},
		)

		invariantResponse(session.url, 'Failed to create checkout session URL', {
			status: 500,
		})

		// Increment coupon usedCount if coupon was applied
		if (couponValidation) {
			try {
				await incrementCouponUsedCount(couponValidation.couponId)
			} catch (err) {
				Sentry.captureException(err, {
					tags: { context: 'coupon-increment' },
					extra: { couponId: couponValidation.couponId },
				})
				// Don't fail checkout if count increment fails
			}
		}

		// Redirect to Stripe Checkout
		return redirect(session.url)
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'checkout-session-creation' },
		})

		if (error instanceof IdempotencyConflictError) {
			return data(
				{
					error: 'checkout_in_progress',
					message:
						'Your checkout is already being processed. Please wait a moment and try again.',
				},
				{ status: 409 },
			)
		}

		const stripeError = handleStripeError(error)
		return data(
			{
				error: 'Failed to create checkout session',
				message: stripeError.message,
			},
			{ status: 500 },
		)
	}
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./payment.lazy')
