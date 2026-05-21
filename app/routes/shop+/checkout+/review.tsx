import { Link, redirectDocument, useLoaderData } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
<<<<<<< HEAD
import { getCheckoutData, calculateCartVat } from '#app/utils/checkout.server.ts'
=======
import { getCheckoutData } from '#app/utils/checkout.server.ts'
>>>>>>> feat/t_bbce3b
import { useTranslation } from '#app/utils/i18n.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/review.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const checkoutData = await getCheckoutData(request)

	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	// Calculate VAT estimate using merchant country as default
	// (actual VAT will be computed at payment time with real shipping country)
	let vatEstimate = null
	try {
		vatEstimate = await calculateCartVat(
			checkoutData.cart,
			checkoutData.defaultShippingAddress?.country || 'FR',
		)
	} catch {
		// VAT calculation failure shouldn't block checkout
	}

	return {
		cart: checkoutData.cart,
		currency: checkoutData.currency,
		subtotal: checkoutData.subtotal,
		vatEstimate,
	}
}

export default function CheckoutReview() {
	const loaderData = useLoaderData<typeof loader>()
	const { t, locale } = useTranslation()
<<<<<<< HEAD
	
	if (!loaderData) {
		return <div>{t('shop.checkout.review.loading')}</div>
	}
	
	const { cart, currency, subtotal, vatEstimate } = loaderData
=======

	if (!loaderData) {
		return <div>{t('checkout.loading')}</div>
	}

	const { cart, currency, subtotal } = loaderData
>>>>>>> feat/t_bbce3b

	return (
		<div className="space-y-6">
			<div className="rounded-lg border bg-card p-6">
<<<<<<< HEAD
				<h2 className="mb-4 text-xl font-semibold">{t('shop.checkout.review.title')}</h2>
				
=======
				<h2 className="mb-4 text-xl font-semibold">
					{t('checkout.review.title')}
				</h2>

>>>>>>> feat/t_bbce3b
				<div className="space-y-4">
					{cart.items.map((item) => {
						const price = item.variant?.price ?? item.product.price
						const image = item.product.images[0]

						return (
							<div key={item.id} className="flex items-center gap-4">
								{image && (
									<img
										src={`/images/${image.objectKey}`}
										alt={image.altText || item.product.name}
										className="h-20 w-20 rounded object-cover"
									/>
								)}
								<div className="flex-1">
									<h3 className="font-medium">{item.product.name}</h3>
									{item.variant && (
										<p className="text-sm text-muted-foreground">
											SKU: {item.variant.sku}
										</p>
									)}
<<<<<<< HEAD
						<p className="text-sm text-muted-foreground">
							{t('shop.checkout.review.quantity', { count: item.quantity })}
						</p>
=======
									<p className="text-sm text-muted-foreground">
										{t('checkout.review.quantity', { count: item.quantity })}
									</p>
>>>>>>> feat/t_bbce3b
								</div>
								<div className="text-right">
									<p className="font-medium">
										{formatPrice((price ?? 0) * item.quantity, currency, locale)}
									</p>
								</div>
							</div>
						)
					})}
				</div>

<<<<<<< HEAD
				<div className="mt-6 border-t pt-4 space-y-2">
				<div className="flex justify-between text-lg font-semibold">
					<span>{t('shop.checkout.review.subtotal')}</span>
=======
				<div className="mt-6 border-t pt-4">
					<div className="flex justify-between text-lg font-semibold">
						<span>{t('checkout.review.subtotal')}</span>
>>>>>>> feat/t_bbce3b
						<span>{formatPrice(subtotal, currency, locale)}</span>
					</div>
					{vatEstimate && vatEstimate.totalVatCents > 0 && (
						<>
							{vatEstimate.breakdown.map((line) => (
								<div key={`${line.kind}-${line.rate}`} className="flex justify-between text-sm text-muted-foreground">
									<span>{t('shop.checkout.review.vatKind', { kind: line.kind, rate: (line.rate / 100).toFixed(1) })}</span>
									<span>{formatPrice(line.vatCents, currency, locale)}</span>
								</div>
							))}
							<div className="flex justify-between text-sm text-muted-foreground">
								<span>{t('shop.checkout.review.estimatedVatTotal')}</span>
								<span>{formatPrice(vatEstimate.totalVatCents, currency, locale)}</span>
							</div>
							<div className="border-t pt-2 flex justify-between text-lg font-bold">
								<span>{t('shop.checkout.review.estimatedTotal')}</span>
								<span>{formatPrice(subtotal + vatEstimate.totalVatCents, currency, locale)}</span>
							</div>
						</>
					)}
					{(!vatEstimate || vatEstimate.totalVatCents === 0) && (
					<p className="text-sm text-muted-foreground italic">
						{t('shop.checkout.review.vatPending')}
					</p>
					)}
				</div>
			</div>

			<div className="flex justify-between">
				<Button variant="outline" asChild>
<<<<<<< HEAD
					<Link to="/shop/cart">{t('shop.checkout.review.backToCart')}</Link>
				</Button>
				<Button asChild>
					<Link to="/shop/checkout/shipping">{t('shop.checkout.review.continueToShipping')}</Link>
=======
					<Link to="/shop/cart">{t('checkout.review.backToCart')}</Link>
				</Button>
				<Button asChild>
					<Link to="/shop/checkout/shipping">
						{t('checkout.review.continueToShipping')}
					</Link>
>>>>>>> feat/t_bbce3b
				</Button>
			</div>
		</div>
	)
}
