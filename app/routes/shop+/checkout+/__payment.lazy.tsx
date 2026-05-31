import { invariantResponse } from '@epic-web/invariant'
import { useEffect } from 'react'
import { data, Link, redirect, redirectDocument, useActionData, useLoaderData } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { validateCoupon, incrementCouponUsedCount } from '#app/utils/coupon.server.ts'
import { computeDiscountAmount, couponErrorMessages } from '#app/schemas/coupon.ts'
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
import { type Route } from './+types/payment.ts'
import type { loader, action } from './payment.ts'

export default function CheckoutPayment() {
	const loaderData = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const { t, locale } = useTranslation()

	// Auto-submit to create Stripe session on mount
	useEffect(() => {
		if (!actionData?.error && loaderData) {
			const form = document.createElement('form')
			form.method = 'POST'
			form.action = window.location.pathname + window.location.search
			document.body.appendChild(form)
			form.submit()
		}
	}, [actionData?.error, loaderData])

	if (!loaderData) {
		return (
			<div className="text-center">
				<p className="text-muted-foreground">{t('shop.checkout.review.loading')}</p>
			</div>
		)
	}

	const {
		cart,
		currency,
		subtotal,
		shippingInfo,
		shippingCost,
		vatCalculation,
		couponDiscount,
		couponDiscountCents,
		preDiscountTotal,
	} = loaderData

	if (actionData?.error) {
		return (
			<div className="space-y-6">
				<Card>
					<CardContent className="pt-6">
						<div className="text-center space-y-4">
							<h2 className="text-2xl font-bold text-destructive">{t('shop.checkout.payment.error')}</h2>
							<p className="text-muted-foreground">
								{'message' in actionData ? actionData.message : actionData.error}
							</p>
							{'messages' in actionData && actionData.messages && (
								<div className="text-sm text-muted-foreground">
									{actionData.messages.map((msg: string, i: number) => (
										<p key={i}>{msg}</p>
									))}
								</div>
							)}
							<div className="flex justify-center gap-4 pt-4">
								<Button variant="outline" asChild>
									<Link to={`/shop/checkout/delivery?${new URLSearchParams({
										name: loaderData.shippingInfo.name,
										email: loaderData.shippingInfo.email,
										street: loaderData.shippingInfo.street,
										city: loaderData.shippingInfo.city,
										state: loaderData.shippingInfo.state || '',
										postal: loaderData.shippingInfo.postal,
										country: loaderData.shippingInfo.country,
										shippingMethodId: loaderData.shippingMethodId,
										shippingCost: loaderData.shippingCost.toString(),
									}).toString()}`}>
										{t('shop.checkout.payment.backToDelivery')}
									</Link>
								</Button>
								<Button asChild>
									<Link to="/shop/cart">{t('shop.checkout.payment.returnToCart')}</Link>
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		)
	}

	if (!cart || !currency) {
		return (
			<div className="text-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		)
	}

	const finalTotal = preDiscountTotal - couponDiscountCents

	return (
		<div className="space-y-6">
			<Card>
				<CardContent className="pt-6">
					<div className="text-center space-y-4">
						<h2 className="text-2xl font-bold">{t('shop.checkout.payment.title')}</h2>
						<p className="text-muted-foreground">
							{t('shop.checkout.payment.redirecting')}
						</p>
						<div className="flex justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="border rounded-lg p-6 space-y-4">
				<h3 className="text-lg font-semibold">{t('shop.checkout.payment.orderSummary')}</h3>
				<div className="space-y-2">
					<div className="flex justify-between">
						<span>{t('shop.checkout.payment.subtotal')}</span>
						<span>{formatPrice(subtotal, currency, locale)}</span>
					</div>

					{/* Coupon Discount */}
					{couponDiscount && couponDiscountCents > 0 && (
						<div className="flex justify-between text-green-600">
							<span>
								{t('shop.checkout.payment.couponDiscount') as string || 'Coupon'} ({couponDiscount.couponCode})
							</span>
							<span>-{formatPrice(couponDiscountCents, currency, locale)}</span>
						</div>
					)}

					<div className="flex justify-between">
						<span>{t('shop.checkout.payment.shipping')}</span>
						<span>
							{shippingCost === 0 ? (
								<span className="text-green-600">{t('shop.checkout.payment.free')}</span>
							) : (
								formatPrice(shippingCost, currency, locale)
							)}
						</span>
					</div>
					{vatCalculation && vatCalculation.totalVatCents > 0 && (
						<>
							{vatCalculation.breakdown.map((line) => (
								<div key={`${line.kind}-${line.rate}`} className="flex justify-between text-sm text-muted-foreground">
									<span>{t('shop.checkout.review.vatKind', { kind: line.kind, rate: (line.rate / 100).toFixed(1) })}</span>
									<span>{formatPrice(line.vatCents, currency, locale)}</span>
								</div>
							))}
						</>
					)}
					{vatCalculation && vatCalculation.totalVatCents === 0 && (
						<div className="flex justify-between text-sm text-muted-foreground">
							<span>{t('shop.checkout.payment.vat')}</span>
							<span>€0.00</span>
						</div>
					)}
					<div className="flex justify-between text-lg font-bold border-t pt-2">
						<span>{t('shop.checkout.payment.total')}</span>
						<span>{formatPrice(finalTotal, currency)}</span>
					</div>
				</div>
			</div>

			{shippingInfo && (
				<div className="border rounded-lg p-6">
					<h3 className="text-lg font-semibold mb-4">{t('shop.checkout.payment.shippingTo')}</h3>
					<p className="font-medium">{shippingInfo.name}</p>
					<p className="text-sm text-muted-foreground">{shippingInfo.street}</p>
					<p className="text-sm text-muted-foreground">
						{shippingInfo.city}
						{shippingInfo.state && `, ${shippingInfo.state}`} {shippingInfo.postal}
					</p>
					<p className="text-sm text-muted-foreground">{shippingInfo.country}</p>
				</div>
			)}
		</div>
	)
}
