import { useState } from 'react'
import { Link, useLoaderData, useNavigate } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/review.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const checkoutData = await getCheckoutData(request)

	if (!checkoutData) {
		return Response.redirect('/shop/cart')
	}

	return {
		cart: checkoutData.cart,
		currency: checkoutData.currency,
		subtotal: checkoutData.subtotal,
	}
}

export default function CheckoutReview() {
	const loaderData = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const [cgvAccepted, setCgvAccepted] = useState(false)
	const [cgvError, setCgvError] = useState(false)

	if (!loaderData) {
		return <div>Loading...</div>
	}

	const { cart, currency, subtotal } = loaderData

	function handleContinue() {
		if (!cgvAccepted) {
			setCgvError(true)
		} else {
			setCgvError(false)
			void navigate('/shop/checkout/shipping')
		}
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

				<div className="mt-6 border-t pt-4">
					<div className="flex justify-between text-lg font-semibold">
						<span>Subtotal</span>
						<span>{formatPrice(subtotal, currency)}</span>
					</div>
				</div>
			</div>

			{/* CGV consent */}
			<div className="rounded-lg border bg-card p-6">
				<div className="flex items-start gap-3">
					<Checkbox
						id="cgv-consent"
						checked={cgvAccepted}
						onCheckedChange={(checked) => {
							setCgvAccepted(checked === true)
							if (checked) setCgvError(false)
						}}
						aria-describedby={cgvError ? 'cgv-error' : undefined}
						aria-invalid={cgvError}
					/>
					<div className="grid gap-1">
						<label
							htmlFor="cgv-consent"
							className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							I have read and accept the{' '}
							<Link
								to="/cgv"
								className="underline hover:text-primary"
								target="_blank"
								rel="noopener noreferrer"
							>
								Conditions Générales de Vente (CGV)
							</Link>
						</label>
						{cgvError && (
							<p id="cgv-error" className="text-sm text-destructive">
								You must accept the CGV before continuing.
							</p>
						)}
					</div>
				</div>
			</div>

			<div className="flex justify-between">
				<Button variant="outline" asChild>
					<Link to="/shop/cart">Back to Cart</Link>
				</Button>
				<Button onClick={handleContinue}>Continue to Shipping</Button>
			</div>
		</div>
	)
}
