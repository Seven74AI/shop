import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$methodId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const method = await prisma.shippingMethod.findUnique({
		where: { id: params.methodId },
		include: {
			carrier: {
				select: {
					id: true,
					name: true,
					displayName: true,
				},
			},
			zone: {
				select: {
					id: true,
					name: true,
				},
			},
			_count: {
				select: { orders: true },
			},
		},
	})

	invariantResponse(method, 'Shipping method not found', { status: 404 })

	const currency = await getStoreCurrency()

	return { method, currency }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.method.name} | Shipping Methods | Admin | Epic Shop` },
	{ name: 'description', content: `View shipping method: ${loaderData?.method.name}` },
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$methodId.lazy')
