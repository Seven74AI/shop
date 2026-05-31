import { Form, Link, useSearchParams } from 'react-router'
import { useRef } from 'react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { OrderStatusBadge } from '#app/components/order-status-badge.tsx'
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
import { getAdminOrders } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const page = parseInt(url.searchParams.get('page') || '1', 10)
	const search = url.searchParams.get('search') || ''
	const status = url.searchParams.get('status') || ''
	const dateFrom = url.searchParams.get('dateFrom') || ''
	const dateTo = url.searchParams.get('dateTo') || ''

	const result = await getAdminOrders({
		page: isNaN(page) || page < 1 ? 1 : page,
		perPage: 25,
		search,
		status,
		dateFrom,
		dateTo,
	})

	const currency = await getStoreCurrency()

	return {
		...result,
		currency,
		search,
		status,
		dateFrom,
		dateTo,
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Orders | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage all orders' },
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
