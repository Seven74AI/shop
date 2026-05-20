import { useState } from 'react'
import { Link, redirectDocument, useLoaderData, useSearchParams } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/review.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const couponCode = url.searchParams.get('coupon')
	
	const checkoutData = await getCheckoutData(request, couponCode)
	
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	return {
		cart: checkoutData.cart,
		currency: checkoutData.currency,
		subtotal: checkoutData.subtotal,
		couponResult: checkoutData.couponResult,
	}
}

export default function CheckoutReview() {
	const loaderData = useLoaderData<typeof loader>()
	const [searchParams, setSearchParams] = useSearchParams()
	const [couponInput, setCouponInput] = useState(searchParams.get('coupon') || '')
	
	if (!loaderData) {
		return <div>Loading...</div>
	}
	
	const { cart, currency, subtotal, couponResult } = loaderData

	const discountCents = couponResult?.valid ? couponResult.discountCents : 0
	const total = subtotal - discountCents

	const handleApplyCoupon = () => {
		const trimmed = couponInput.trim()
		if (trimmed) {
			setSearchParams({ coupon: trimmed })
		}
	}

	const handleClearCoupon = () => {
		setCouponInput('')
		setSearchParams({})
	}

	return (
		<div className="space-y-6">
			<div className="rounded-lg border bg-card p-6">
				<h2 className="mb-4 text-xl font-semibold">Order Summary</h2>
				
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
									<p className="text-sm text-muted-foreground">
										Quantity: {item.quantity}
									</p>
								</div>
								<div className="text-right">
									<p className="font-medium">
										{formatPrice((price ?? 0) * item.quantity, currency)}
									</p>
								</div>
							</div>
						)
					})}
				</div>

				{/* Coupon code section */}
				<div className="mt-6 border-t pt-4">
					<div className="flex gap-2">
						<Input
							type="text"
							placeholder="Coupon code"
							value={couponInput}
							onChange={(e) => setCouponInput(e.target.value)}
							className="flex-1 uppercase"
						/>
						<Button variant="outline" onClick={handleApplyCoupon} type="button">
							Apply
						</Button>
						{searchParams.get('coupon') && (
							<Button variant="ghost" onClick={handleClearCoupon} type="button">
								Clear
							</Button>
						)}
					</div>
					{couponResult && !couponResult.valid && (
						<p className="mt-2 text-sm text-destructive">{couponResult.error}</p>
					)}
					{couponResult && couponResult.valid && (
						<p className="mt-2 text-sm text-green-600">
							Coupon &quot;{couponResult.promotion.code}&quot; applied: -{formatPrice(couponResult.discountCents, currency)}
						</p>
					)}
				</div>

				<div className="mt-4 border-t pt-4 space-y-2">
					<div className="flex justify-between">
						<span>Subtotal</span>
						<span>{formatPrice(subtotal, currency)}</span>
					</div>
					{discountCents > 0 && (
						<div className="flex justify-between text-green-600">
							<span>Discount</span>
							<span>-{formatPrice(discountCents, currency)}</span>
						</div>
					)}
					<div className="flex justify-between text-lg font-semibold">
						<span>Total</span>
						<span>{formatPrice(total, currency)}</span>
					</div>
				</div>
			</div>

			<div className="flex justify-between">
				<Button variant="outline" asChild>
					<Link to="/shop/cart">Back to Cart</Link>
				</Button>
				<Button asChild>
					<Link to={`/shop/checkout/shipping${couponResult?.valid ? `?coupon=${encodeURIComponent(couponResult.promotion.code)}` : ''}`}>
						Continue to Shipping
					</Link>
				</Button>
			</div>
		</div>
	)
}
