import { invariantResponse } from '@epic-web/invariant'
import { Link, redirect, data } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { addToCart, getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { createReview, getProductReviews, getProductRatingStats } from '#app/utils/reviews.server.ts'
import { type Route } from './+types/$slug.ts'

export async function loader({ params }: Route.LoaderArgs) {
	const product = await prisma.product.findUnique({
		where: {
			slug: params.slug,
		},
		include: {
			category: {
				select: { id: true, name: true, slug: true },
			},
			images: {
				select: { objectKey: true, altText: true },
				orderBy: { displayOrder: 'asc' },
			},
		},
	})

	invariantResponse(product, 'Product not found', { status: 404 })

	const currency = await getStoreCurrency()
	const reviews = await getProductReviews(product.id)
	const ratingStats = await getProductRatingStats(product.id)

	return { product, currency, reviews, ratingStats }
}

export async function action({ request, params }: Route.ActionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'add-to-cart') {
		const product = await prisma.product.findUnique({
			where: { slug: params.slug },
			select: { id: true },
		})

		invariantResponse(product, 'Product not found', { status: 404 })

		const { cart, needsCommit, cookieHeader } = await getOrCreateCartFromRequest(request)

		const variantId = formData.get('variantId') as string | null
		const quantity = Number(formData.get('quantity') || '1')

		await addToCart(cart.id, product.id, variantId, quantity)

		if (needsCommit && cookieHeader) {
			return redirect(`/shop/cart`, {
				headers: { 'Set-Cookie': cookieHeader },
			})
		}

		return redirect(`/shop/cart`)
	}

	if (intent === 'submit-review') {
		const userId = await requireUserId(request)

		const product = await prisma.product.findUnique({
			where: { slug: params.slug },
			select: { id: true },
		})
		invariantResponse(product, 'Product not found', { status: 404 })

		const rating = Number(formData.get('rating'))
		const title = formData.get('title') as string | null
		const body = formData.get('body') as string

		const review = await createReview({
			userId,
			productId: product.id,
			rating,
			title: title || undefined,
			body,
		})

		return data({ success: true, review }, { status: 201 })
	}

	invariantResponse(false, 'Bad Request', { status: 400 })
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	const product = loaderData?.product
	if (!product) return [{ title: 'Product Not Found | Shop | Epic Shop' }]
	return [{ title: `${product.name} | Products | Shop | Epic Shop` }]
}

function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
	const sizeClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-lg'
	return (
		<span className={`${sizeClass} text-yellow-500`} aria-label={`${rating} out of 5 stars`}>
			{'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
		</span>
	)
}

function ReviewForm({ productSlug }: { productSlug: string }) {
	return (
		<div className="border rounded-lg p-6 space-y-4">
			<h3 className="text-lg font-semibold">Write a Review</h3>
			<form method="post" className="space-y-4">
				<input type="hidden" name="intent" value="submit-review" />

				<div>
					<Label htmlFor="rating">Rating</Label>
					<div className="flex gap-1 mt-1">
						{[5, 4, 3, 2, 1].map((star) => (
							<label key={star} className="cursor-pointer">
								<input
									type="radio"
									name="rating"
									value={star}
									required
									className="sr-only peer"
								/>
								<span className="text-2xl text-gray-300 peer-checked:text-yellow-500 hover:text-yellow-400 transition-colors">
									★
								</span>
							</label>
						))}
					</div>
				</div>

				<div>
					<Label htmlFor="title">Title (optional)</Label>
					<Input id="title" name="title" maxLength={200} placeholder="Summary of your review" />
				</div>

				<div>
					<Label htmlFor="body">Review</Label>
					<Textarea
						id="body"
						name="body"
						required
						maxLength={5000}
						rows={4}
						placeholder="Share your experience with this product"
					/>
				</div>

				<Button type="submit">Submit Review</Button>
			</form>
		</div>
	)
}

export default function ProductSlug({ loaderData }: Route.ComponentProps) {
	const { product, currency, reviews, ratingStats } = loaderData

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="grid gap-8 md:grid-cols-2">
				{/* Product Images */}
				<div>
					{product.images && product.images.length > 0 && product.images[0] ? (
						<img
							src={`/resources/images?objectKey=${encodeURIComponent(product.images[0].objectKey)}`}
							alt={product.images[0].altText || product.name}
							className="w-full rounded-lg border"
						/>
					) : (
						<div className="aspect-square w-full rounded-lg border bg-muted flex items-center justify-center">
							<span className="text-muted-foreground">No image</span>
						</div>
					)}
				</div>

				{/* Product Details */}
				<div className="space-y-6">
					<div>
						<h1 className="text-4xl font-bold tracking-tight">{product.name}</h1>
						<p className="text-muted-foreground mt-2">{product.category.name}</p>
					</div>

					{/* Rating summary */}
					{ratingStats.reviewCount > 0 && (
						<div className="flex items-center gap-2">
							<StarRating rating={ratingStats.averageRating ?? 0} size="lg" />
							<span className="text-muted-foreground text-sm">
								{ratingStats.averageRating?.toFixed(1)} ({ratingStats.reviewCount}{' '}
								{ratingStats.reviewCount === 1 ? 'review' : 'reviews'})
							</span>
						</div>
					)}

					<div>
						<p className="text-3xl font-bold">{formatPrice(product.price, currency)}</p>
					</div>

					{product.description && (
						<div>
							<h2 className="text-lg font-semibold mb-2">Description</h2>
							<p className="text-muted-foreground whitespace-pre-wrap">{product.description}</p>
						</div>
					)}

					<form method="post" className="space-y-4">
						<input type="hidden" name="intent" value="add-to-cart" />
						<Button type="submit" size="lg" className="w-full">
							Add to Cart
						</Button>
					</form>

					<div className="pt-4 border-t">
						<Link to="/shop/products" className="text-sm text-muted-foreground hover:underline">
							← Back to Products
						</Link>
					</div>
				</div>
			</div>

			{/* Reviews Section */}
			<div className="mt-12 space-y-8">
				<div className="border-t pt-8">
					<h2 className="text-2xl font-bold mb-6">
						Customer Reviews
						{ratingStats.reviewCount > 0 && (
							<span className="text-muted-foreground text-lg font-normal ml-2">
								({ratingStats.reviewCount})
							</span>
						)}
					</h2>

					<div className="grid gap-8 lg:grid-cols-3">
						{/* Review list */}
						<div className="lg:col-span-2 space-y-6">
							{reviews.length === 0 ? (
								<p className="text-muted-foreground">
									No reviews yet. Be the first to review this product!
								</p>
							) : (
								reviews.map((review) => (
									<div key={review.id} className="border-b pb-6 last:border-b-0">
										<div className="flex items-center gap-3 mb-2">
											<StarRating rating={review.rating} size="sm" />
											<span className="text-sm font-medium">
												{review.user.name || review.user.username}
											</span>
											{review.isVerifiedPurchase && (
												<span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
													Verified Purchase
												</span>
											)}
											<span className="text-xs text-muted-foreground">
												{new Date(review.createdAt).toLocaleDateString()}
											</span>
										</div>
										{review.title && (
											<h4 className="font-semibold mb-1">{review.title}</h4>
										)}
										<p className="text-muted-foreground whitespace-pre-wrap">{review.body}</p>
									</div>
								))
							)}
						</div>

						{/* Review form */}
						<div>
							<ReviewForm productSlug={product.slug} />
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
