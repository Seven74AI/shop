import { invariantResponse } from '@epic-web/invariant'
import { Link, redirect } from 'react-router'
import { StarRating } from '#app/components/star-rating.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { addToCart, getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import {
	buildBreadcrumbListLd,
	buildProductLd,
	renderJsonLd,
} from '#app/utils/json-ld.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { getProductReviewAggregate } from '#app/utils/review-aggregate.server.ts'
import { buildImageUrl, generateOgTags, generateTwitterCard } from '#app/utils/seo-meta.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$slug.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
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
	const siteUrl = getDomainUrl(request)
	const reviewAggregate = await getProductReviewAggregate(product.id)

	// Build JSON-LD structured data
	const imageUrls = product.images.map(
		(img) => `${siteUrl}/resources/images?objectKey=${encodeURIComponent(img.objectKey)}`,
	)

	const productLd = buildProductLd({
		siteUrl,
		product: {
			name: product.name,
			slug: product.slug,
			description: product.description,
			sku: product.sku,
			price: product.price,
			status: product.status,
		},
		currency: currency?.code ?? 'USD',
		imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
		categoryName: product.category.name,
	})

	const breadcrumbLd = buildBreadcrumbListLd([
		{ name: 'Home', href: `${siteUrl}/` },
		{ name: 'Products', href: `${siteUrl}/shop/products` },
		{
			name: product.category.name,
			href: `${siteUrl}/shop/categories/${product.category.slug}`,
		},
		{ name: product.name, href: `${siteUrl}/shop/products/${product.slug}` },
	])

	return {
		product,
		currency,
		siteUrl,
		reviewAggregate,
		jsonLd: renderJsonLd(productLd) + '\n' + renderJsonLd(breadcrumbLd),
	}
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

		const { cart, needsCommit, cookieHeader } =
			await getOrCreateCartFromRequest(request)

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

	invariantResponse(false, 'Bad Request', { status: 400 })
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	const product = loaderData?.product
	const siteUrl = loaderData?.siteUrl ?? 'http://localhost'
	if (!product) return [{ title: 'Product Not Found | Shop | Epic Shop' }]

	const productUrl = `${siteUrl}/shop/products/${product.slug}`
	const productImageUrl = product.images?.[0]?.objectKey
		? buildImageUrl(product.images[0].objectKey, siteUrl)
		: null
	const price = loaderData?.currency
		? `${formatPrice(product.price, loaderData.currency, 'en')} ${loaderData.currency.code}`
		: undefined

	return [
		{ title: `${product.name} | Products | Shop | Epic Shop` },
		...generateOgTags({
			siteName: 'Epic Shop',
			siteUrl,
			productName: product.name,
			productDescription: product.description,
			productImageUrl,
			productPrice: price,
			productUrl,
		}),
		...generateTwitterCard({ site: '@epicshop' }),
	]
}

export default function ProductSlug({ loaderData }: Route.ComponentProps) {
	const { t, locale } = useTranslation()
	const { product, currency, reviewAggregate } = loaderData

	return (
		<div className="container mx-auto px-4 py-8">
			{/* JSON-LD structured data */}
			<div
				dangerouslySetInnerHTML={{ __html: loaderData.jsonLd }}
				suppressHydrationWarning
			/>

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
							<span className="text-muted-foreground">
								{t('shop.product.detail.noImage')}
							</span>
						</div>
					)}
				</div>

				{/* Product Details */}
				<div className="space-y-6">
					<div>
						<h1 className="text-4xl font-bold tracking-tight">
							{product.name}
						</h1>
						<p className="text-muted-foreground mt-2">
							{product.category.name}
						</p>
				</div>

				{/* Rating summary */}
				<StarRating
					averageRating={reviewAggregate.averageRating}
					distribution={reviewAggregate.distribution}
					totalCount={reviewAggregate.totalCount}
					showDistribution
					size="md"
				/>

				<div>
					<p className="text-3xl font-bold">
							{formatPrice(product.price, currency, locale)}
						</p>
					</div>

					{product.description && (
						<div>
							<h2 className="text-lg font-semibold mb-2">
								{t('shop.product.detail.description')}
							</h2>
							<p className="text-muted-foreground whitespace-pre-wrap">
								{product.description}
							</p>
						</div>
					)}

					<form method="post" className="space-y-4">
						<input type="hidden" name="intent" value="add-to-cart" />
						<Button type="submit" size="lg" className="w-full">
							{t('shop.product.detail.addToCart')}
						</Button>
					</form>

					<div className="pt-4 border-t">
						<Link
							to="/shop/products"
							className="text-sm text-muted-foreground hover:underline"
						>
							{t('shop.product.detail.backToProducts')}
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}
