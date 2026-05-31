import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
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
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const invoices = await prisma.invoice.findMany({
		include: {
			order: {
				select: {
					orderNumber: true,
					email: true,
					shippingName: true,
					user: {
						select: {
							id: true,
							email: true,
							name: true,
						},
					},
				},
			},
		},
		orderBy: { createdAt: 'desc' },
		take: 100,
	})

	const currency = await getStoreCurrency()

	return { invoices, currency }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Invoices | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage all invoices' },
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
