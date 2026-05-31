import { useState, useMemo } from 'react'
import { Link, useFetcher } from 'react-router'
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
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
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
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all products for client-side filtering
	const products = await prisma.product.findMany({
		include: {
			category: {
				select: { id: true, name: true, slug: true },
			},
			images: {
				select: { objectKey: true, altText: true },
				orderBy: { displayOrder: 'asc' },
				take: 1,
			},
			variants: {
				select: { stockQuantity: true },
			},
			tags: {
				include: {
					tag: { select: { name: true } },
				},
			},
		},
		orderBy: { updatedAt: 'desc' },
	})

	// Get categories for filter
	const categories = await prisma.category.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	// Get currency for price formatting
	const currency = await getStoreCurrency()

	return {
		products,
		categories,
		currency,
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Products | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage your product catalog' },
]

function DeleteProductButton({ product }: { product: Route.ComponentProps['loaderData']['products'][number] }) {
	const fetcher = useFetcher()

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive hover:text-destructive transition-colors duration-200"
					aria-label="Delete product"
				>
					<Icon name="trash" className="h-4 w-4" />
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

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
