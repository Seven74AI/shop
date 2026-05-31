import { invariantResponse } from '@epic-web/invariant'
import { Link, useFetcher } from 'react-router'
import { ProductImageScrollArea } from '#app/components/product-image-scroll-area.tsx'
import { ProductStatusBadge, StockBadge } from '#app/components/product-status-badge.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import {
	productImagesOrderedInclude,
	variantsWithAttributesInclude,
} from '#app/utils/prisma-includes.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$productSlug.ts'

/**
 * Loads product details for display
 * 
 * @param params - Route parameters containing the product slug
 * @param request - HTTP request object
 * @returns Product data with all relations (images, variants, tags, category)
 * @throws {invariantResponse} If product is not found (404)
 */
export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const product = await prisma.product.findUnique({
		where: { slug: params.productSlug },
		include: {
			category: {
				select: { id: true, name: true, slug: true },
			},
			...productImagesOrderedInclude,
			variants: {
				...variantsWithAttributesInclude.variants,
				orderBy: { id: 'asc' },
			},
			tags: {
				include: {
					tag: { select: { name: true } },
				},
			},
		},
	})

	invariantResponse(product, 'Product not found', { status: 404 })

	const currency = await getStoreCurrency()

	return {
		product: {
			...product,
			price: Number(product.price),
			variants: product.variants.map(variant => ({
				...variant,
				price: variant.price ? Number(variant.price) : null,
				attributes: variant.attributeValues.reduce((acc: Record<string, string>, av) => {
					acc[av.attributeValue.attribute.name] = av.attributeValue.value
					return acc
				}, {}),
			})),
		},
		currency,
	}
}

/**
 * Generates metadata for the product view page
 * 
 * @param args - Route meta arguments containing loader data
 * @returns Array of meta tags for the page
 */
export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.product.name} | Admin | Epic Shop` },
	{ name: 'description', content: `View product: ${loaderData?.product.name}` },
]

/**
 * DeleteProductButton component with confirmation dialog
 * 
 * @param product - Product data to delete
 * @returns Alert dialog button for deleting the product
 */
function DeleteProductButton({ product }: { product: Route.ComponentProps['loaderData']['product'] }) {
	const fetcher = useFetcher()

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="destructive"
					className="h-9 px-4 rounded-lg font-medium transition-colors duration-200"
				>
					<Icon name="trash" className="h-4 w-4 mr-2" />
					Delete Product
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Product</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete "{product.name}"? This action cannot be undone.
						{product.variants?.length > 0 && (
							<span className="block mt-2 text-destructive">
								This will also delete {product.variants.length} variant(s).
							</span>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<fetcher.Form 
						method="POST" 
						action={`/admin/products/${product.slug}/delete`}
					>
						<AlertDialogAction
							type="submit"
							disabled={fetcher.state !== 'idle'}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
						>
							{fetcher.state === 'idle' ? 'Delete Product' : 'Deleting...'}
						</AlertDialogAction>
					</fetcher.Form>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

/**
 * ProductView component for displaying product details
 * 
 * @param loaderData - Product data loaded from the loader function
 * @returns React component with product information, images, variants, and metadata
 */

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$productSlug.lazy')
