import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$categorySlug.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const category = await prisma.category.findUnique({
		where: { slug: params.categorySlug },
		include: {
			parent: {
				select: { id: true, name: true, slug: true },
			},
			children: {
				select: { 
					id: true, 
					name: true, 
					slug: true, 
					description: true,
					_count: { select: { products: true } }
				},
				orderBy: { name: 'asc' },
			},
			_count: {
				select: { products: true },
			},
		},
	})

	invariantResponse(category, 'Category not found', { status: 404 })

	// Get products in this category
	const products = await prisma.product.findMany({
		where: { categoryId: category.id },
		select: {
			id: true,
			name: true,
			slug: true,
			sku: true,
			price: true,
			status: true,
			images: {
				select: { objectKey: true },
				orderBy: { displayOrder: 'asc' },
				take: 1,
			},
		},
		orderBy: { name: 'asc' },
		take: 10, // Limit to first 10 products
	})

	return { category, products }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.category.name} | Categories | Admin | Epic Shop` },
	{ name: 'description', content: `View category: ${loaderData?.category.name}` },
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$categorySlug.lazy')
