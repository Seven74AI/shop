import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
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
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$zoneId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const zone = await prisma.shippingZone.findUnique({
		where: { id: params.zoneId },
		include: {
			methods: {
				include: {
					carrier: {
						select: {
							id: true,
							name: true,
							displayName: true,
						},
					},
				},
				orderBy: [
					{ displayOrder: 'asc' },
					{ name: 'asc' },
				],
			},
			_count: {
				select: { methods: true },
			},
		},
	})

	invariantResponse(zone, 'Shipping zone not found', { status: 404 })

	const currency = await getStoreCurrency()

	return { zone, currency }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.zone.name} | Shipping Zones | Admin | Epic Shop` },
	{ name: 'description', content: `View shipping zone: ${loaderData?.zone.name}` },
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$zoneId.lazy')
