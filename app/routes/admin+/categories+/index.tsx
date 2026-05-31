import { useState, useMemo } from 'react'
import { Link, useFetcher } from 'react-router'
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
import { Card } from '#app/components/ui/card.tsx'
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
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all categories with hierarchy and product counts
	const allCategories = await prisma.category.findMany({
		include: {
			parent: {
				select: { id: true, name: true, slug: true },
			},
			children: {
				select: { id: true, name: true, slug: true },
			},
			_count: {
				select: { products: true },
			},
		},
		orderBy: [
			{ parentId: 'asc' },
			{ name: 'asc' },
		],
	})

	// Organize categories hierarchically
	const rootCategories = allCategories.filter(cat => !cat.parentId)
	const categories = rootCategories.map(root => ({
		...root,
		children: allCategories.filter(cat => cat.parentId === root.id).map(child => ({
			...child,
			children: [] // Children don't have their own children in this structure
		}))
	}))

	return { categories }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Categories | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage product categories' },
]

function CategoryRow({ category, level = 0 }: { category: Route.ComponentProps['loaderData']['categories'][number] & { level?: number }; level?: number }) {
	const fetcher = useFetcher()
	const isUncategorized = category.id === UNCATEGORIZED_CATEGORY_ID
	const hasChildren = category.children && category.children.length > 0
	
	return (
		<>
			<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
				<TableCell>
					<div className={`flex items-center space-x-3 ${level > 0 ? `ml-${level * 6}` : ''}`}>
						{level > 0 && (
							<div className="flex items-center">
								<Icon name="chevron-right" className="h-4 w-4 text-muted-foreground" />
							</div>
						)}
						<div className="flex-1">
							<div className="flex items-center gap-2">
								<Link 
									to={`/admin/categories/${category.slug}`}
									className="font-medium text-primary hover:underline transition-colors duration-200"
									aria-label={`View ${category.name} category`}
								>
									{category.name}
								</Link>
								{isUncategorized && (
									<Badge variant="warning" className="text-xs">
										System Category
									</Badge>
								)}
							</div>
							{category.description && (
								<div className="text-sm text-muted-foreground mt-1">
									{category.description}
								</div>
							)}
							{/* Mobile-only info */}
							<div className="md:hidden mt-2 flex flex-wrap gap-2">
								<Badge variant="outline" className="text-xs">
									{hasChildren ? `${category.children.length} subcategories` : '0 subcategories'}
								</Badge>
								<Badge variant="default" className="text-xs">
									{category._count.products} products
								</Badge>
								{category.parent && (
									<span className="text-xs text-muted-foreground">
										Parent: {category.parent.name}
									</span>
								)}
							</div>
						</div>
					</div>
				</TableCell>
				<TableCell className="text-muted-foreground hidden md:table-cell">
					{category.parent?.name || (
						<span className="text-muted-foreground">Root Category</span>
					)}
				</TableCell>
				<TableCell className="text-muted-foreground hidden lg:table-cell">
					<Badge variant="outline" className="text-xs">
						{hasChildren ? `${category.children.length} subcategories` : '0 subcategories'}
					</Badge>
				</TableCell>
				<TableCell className="font-medium hidden lg:table-cell">
					<Badge variant="default" className="text-xs">
						{category._count.products} products
					</Badge>
				</TableCell>
								<TableCell className="text-right">
					<div className="flex items-center justify-end space-x-1">
						<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
							<Link to={`/admin/categories/${category.slug}`} aria-label={`View ${category.name}`}>
								<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
							</Link>
						</Button>
						<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
							<Link to={`/admin/categories/${category.slug}/edit`} aria-label={`Edit ${category.name}`}>
								<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
							</Link>
						</Button>
						
						{!isUncategorized && (
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="text-destructive hover:text-destructive transition-colors duration-200"
										aria-label={`Delete ${category.name}`}
									>
										<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Delete Category</AlertDialogTitle>
										<AlertDialogDescription>
											Are you sure you want to delete "{category.name}"? This action cannot be undone.
											{category._count.products > 0 && (
												<span className="block mt-2 text-destructive">
													This category has {category._count.products} products that will be moved to "Uncategorized".
												</span>
											)}
											{hasChildren && (
												<span className="block mt-2 text-destructive">
													This category has {category.children.length} subcategories that will also be deleted.
												</span>
											)}
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<fetcher.Form 
											method="POST" 
											action={`/admin/categories/${category.slug}/delete`}
										>
											<input type="hidden" name="categoryId" value={category.id} />
											<AlertDialogAction
												type="submit"
												disabled={fetcher.state !== 'idle'}
												className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
											>
												{fetcher.state === 'idle' ? 'Delete Category' : 'Deleting...'}
											</AlertDialogAction>
										</fetcher.Form>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						)}
					</div>
				</TableCell>
			</TableRow>
			{hasChildren && category.children.map((child: Route.ComponentProps['loaderData']['categories'][number]['children'][number]) => (
				<CategoryRow key={child.id} category={child} level={level + 1} />
			))}
		</>
	)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
