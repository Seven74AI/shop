import { useState } from 'react'
import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
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
import {
	getMetricsSnapshot,
	type TimeRange,
} from '#app/utils/metrics.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Default to 30d range; client can switch via search params
	const url = new URL(request.url)
	const range = (url.searchParams.get('range') as TimeRange) ?? '30d'
	const metrics = await getMetricsSnapshot(range)
	const currency = await getStoreCurrency()

	return { metrics, currency, range }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Business Metrics | Admin | Epic Shop' },
	{ name: 'description', content: 'Business metrics dashboard for GMV, revenue, orders, and more' },
]

const TIME_RANGES: Array<{ value: TimeRange; label: string }> = [
	{ value: '7d', label: 'Last 7 days' },
	{ value: '30d', label: 'Last 30 days' },
	{ value: '90d', label: 'Last 90 days' },
]


/**
 * Individual metric summary card.
 */
function MetricCard({
	title,
	value,
	description,
	icon,
	trend,
}: {
	title: string
	value: string
	description: string
	icon: string
	trend: { direction: 'up' | 'down'; label: string } | null
}) {
	return (
		<Card className="rounded-[14px]">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-normal text-muted-foreground">
					{title}
				</CardTitle>
				<Icon name={icon as any} className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-semibold tracking-tight">{value}</div>
				<p className="text-xs text-muted-foreground mt-1">{description}</p>
				{trend && (
					<div className="flex items-center gap-1 mt-2 text-xs">
						<Icon
							name={(trend.direction === 'up' ? 'arrow-up' : 'arrow-down') as any}
							className={`h-3 w-3 ${trend.direction === 'up' ? 'text-green-500' : 'text-red-500'}`}
						/>
						<span
							className={trend.direction === 'up' ? 'text-green-500' : 'text-red-500'}
						>
							{trend.label}
						</span>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
