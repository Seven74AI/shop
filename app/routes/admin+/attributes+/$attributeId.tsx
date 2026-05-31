import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$attributeId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const attribute = await prisma.attribute.findUnique({
		where: { id: params.attributeId },
		include: {
			values: {
				orderBy: { displayOrder: 'asc' },
				include: {
					_count: {
						select: { variants: true },
					},
				},
			},
			_count: {
				select: { values: true },
			},
		},
	})

	invariantResponse(attribute, 'Attribute not found', { status: 404 })

	// Get products that use this attribute
	const products = await prisma.product.findMany({
		where: {
			variants: {
				some: {
					attributeValues: {
						some: {
							attributeValue: {
								attributeId: attribute.id,
							},
						},
					},
				},
			},
		},
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

	return { 
		attribute, 
		products: products.map(product => ({
			...product,
			price: Number(product.price),
		}))
	}
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.attribute.name} | Attributes | Admin | Epic Shop` },
	{ name: 'description', content: `View attribute: ${loaderData?.attribute.name}` },
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$attributeId.lazy')
