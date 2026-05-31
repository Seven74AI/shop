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
import type { TimeRange } from '#app/utils/metrics.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/index.ts'



const TIME_RANGES: Array<{ value: TimeRange; label: string }> = [
	{ value: '7d', label: 'Last 7 days' },
	{ value: '30d', label: 'Last 30 days' },
	{ value: '90d', label: 'Last 90 days' },
]

export default function MetricsDashboard({ loaderData }: Route.ComponentProps) {
	const { metrics, currency } = loaderData
	const [range, setRange] = useState<TimeRange>(loaderData.range)

	// Simple form-based navigation for time range changes
	function handleRangeChange(newRange: TimeRange) {
		setRange(newRange)
		// Reload with new range via URL search params
		window.location.search = `?range=${newRange}`
	}

	const activeRangeLabel = TIME_RANGES.find((r) => r.value === range)?.label ?? range

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Business Metrics
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Key performance indicators for your store
					</p>
				</div>
				{/* Time Range Selector */}
				<div className="flex gap-2">
					{TIME_RANGES.map((tr) => (
						<Button
							key={tr.value}
							variant={range === tr.value ? 'default' : 'outline'}
							size="sm"
							className="h-8 rounded-md text-xs"
							onClick={() => handleRangeChange(tr.value)}
						>
							{tr.label}
						</Button>
					))}
				</div>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
				<MetricCard
					title="GMV"
					value={formatPrice(metrics.gmv, currency)}
					description="Gross merchandise value"
					icon="cash"
					trend={null}
				/>
				<MetricCard
					title="Orders"
					value={metrics.ordersCount.toLocaleString()}
					description="Total orders"
					icon="file-text"
					trend={null}
				/>
				<MetricCard
					title="Revenue"
					value={formatPrice(metrics.revenue, currency)}
					description="Net revenue"
					icon="dollar"
					trend={null}
				/>
				<MetricCard
					title="Conversion"
					value={`${metrics.conversionRate}%`}
					description="Orders completed"
					icon="chart"
					trend={null}
				/>
				<MetricCard
					title="Errors"
					value={metrics.errorCount.toLocaleString()}
					description="Tracked errors"
				icon={"alert" as any}
				trend={null}
			/>
		</div>

		{/* Top Products */}
			<Card className="rounded-[14px]">
				<CardHeader className="pb-3">
					<CardTitle className="text-base font-normal">
						Top Products by Quantity Sold ({activeRangeLabel})
					</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					{metrics.topProducts.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
							<Icon name="archive" className="h-8 w-8 mb-2 opacity-50" />
							<p>No sales data for this period.</p>
							<p className="text-sm">Orders will appear here once customers start buying.</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Product</TableHead>
									<TableHead className="text-right">Quantity Sold</TableHead>
									<TableHead className="text-right">Unit Price</TableHead>
									<TableHead className="text-right">Total Revenue</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{metrics.topProducts.map((tp) => (
									<TableRow
										key={tp.product?.id ?? 'unknown'}
										className="transition-colors duration-150 hover:bg-muted/50"
									>
										<TableCell>
											{tp.product ? (
												<Link
													to={`/admin/products/${tp.product.slug}`}
													className="font-medium text-primary hover:underline transition-colors duration-200"
												>
													{tp.product.name}
												</Link>
											) : (
												<span className="text-muted-foreground italic">
													Deleted product
												</span>
											)}
										</TableCell>
										<TableCell className="text-right">
											{tp.quantity.toLocaleString()}
										</TableCell>
										<TableCell className="text-right">
											{tp.product ? formatPrice(tp.product.price, currency) : '—'}
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatPrice(tp.revenue, currency)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

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

export function ErrorBoundary() {
	// Reuse the layout's error boundary
	const { GeneralErrorBoundary: AdminErrorBoundary } = {} as any
	// Simple fallback
	return (
		<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
			<Icon name={"alert" as any} className="h-12 w-12 text-muted-foreground" />
			<h2 className="text-xl font-semibold">Error loading metrics</h2>
			<p className="text-muted-foreground text-center">
				An error occurred while loading the metrics dashboard.
			</p>
			<Button asChild>
				<a href="/admin">Back to Dashboard</a>
			</Button>
		</div>
	)
}
