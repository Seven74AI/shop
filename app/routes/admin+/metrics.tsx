import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { getBusinessMetrics } from '#app/utils/metrics.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	const metrics = await getBusinessMetrics()

	const statusLabels: Record<string, string> = {
		PENDING: 'Pending',
		CONFIRMED: 'Confirmed',
		SHIPPED: 'Shipped',
		DELIVERED: 'Delivered',
		CANCELLED: 'Cancelled',
	}

	return { metrics, statusLabels }
}

export const meta: MetaFunction = () => [
	{ title: 'Business Metrics | Epic Shop' },
	{ name: 'description', content: 'Business metrics dashboard — orders, GMV, errors, conversion' },
]

export default function MetricsDashboard() {
	const { metrics: m, statusLabels } = useLoaderData<typeof loader>()

	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">Business Metrics</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Orders, GMV, errors, and conversion metrics
				</p>
			</div>

			{/* Key Metrics Cards */}
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<Card className="rounded-[14px]">
					<CardContent className="p-6">
						<div className="flex items-center space-x-4 mb-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Icon name="file-text" className="h-5 w-5 text-primary" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Total Orders</p>
								<p className="text-2xl font-semibold">{m.totalOrders}</p>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							{m.recentOrders} in last 30 days
						</p>
					</CardContent>
				</Card>

				<Card className="rounded-[14px]">
					<CardContent className="p-6">
						<div className="flex items-center space-x-4 mb-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Icon name="database" className="h-5 w-5 text-green-600" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Total GMV</p>
								<p className="text-2xl font-semibold">{formatPrice(m.totalGMV)}</p>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							{formatPrice(m.recentGMV)} in last 30 days
						</p>
					</CardContent>
				</Card>

				<Card className="rounded-[14px]">
					<CardContent className="p-6">
						<div className="flex items-center space-x-4 mb-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Icon name="check" className="h-5 w-5 text-blue-600" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Avg Order Value</p>
								<p className="text-2xl font-semibold">{formatPrice(m.averageOrderValue)}</p>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							Across all orders
						</p>
					</CardContent>
				</Card>

				<Card className="rounded-[14px]">
					<CardContent className="p-6">
						<div className="flex items-center space-x-4 mb-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Icon name="shopping-cart" className="h-5 w-5 text-amber-600" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Active Carts</p>
								<p className="text-2xl font-semibold">{m.activeCarts}</p>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							{m.ordersLast7Days} orders in last 7 days
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Orders by Status */}
			<div>
				<h2 className="text-base font-normal text-foreground mb-4">Orders by Status</h2>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
					{Object.entries(m.ordersByStatus as Record<string, number>).map(([status, count]) => (
						<Card key={status} className="rounded-[14px]">
							<CardContent className="p-4">
								<div className="text-center">
									<p className="text-xs text-muted-foreground uppercase tracking-wider">
										{statusLabels[status] || status}
									</p>
									<p className="text-xl font-semibold mt-1">{count}</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</div>

			{/* Quick Links */}
			<div>
				<h2 className="text-base font-normal text-foreground mb-4">Quick Links</h2>
				<div className="flex flex-wrap gap-4">
					<Button asChild className="h-9 rounded-lg font-medium">
						<Link to="/admin/orders">
							<Icon name="file-text" className="mr-2 h-4 w-4" />
							View Orders
						</Link>
					</Button>
					<Button asChild variant="outline" className="h-9 rounded-lg font-medium">
						<Link to="/admin">
							<Icon name="layout-dashboard" className="mr-2 h-4 w-4" />
							Admin Dashboard
						</Link>
					</Button>
				</div>
			</div>

			{/* Explanation */}
			<div className="border rounded-lg p-6 bg-muted/30">
				<h3 className="text-sm font-medium text-foreground mb-3">About These Metrics</h3>
				<div className="text-sm text-muted-foreground space-y-2">
					<p><strong>Total Orders:</strong> All orders ever created, including cancelled.</p>
					<p><strong>GMV (Gross Merchandise Value):</strong> Sum of all order totals (includes cancelled — for net, subtract cancelled order totals).</p>
					<p><strong>Average Order Value:</strong> Mean total per order across all orders.</p>
					<p><strong>Active Carts:</strong> Current number of shopping carts in the database (proxy for browsing intent).</p>
					<p><strong>Error tracking:</strong> Checkout and payment errors are recorded to Sentry under the <code>checkout_error</code> metric tag.</p>
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon name="lock-closed" className="h-12 w-12 text-muted-foreground" />
						<h2 className="text-xl font-semibold">Unauthorized</h2>
						<p className="text-muted-foreground text-center">
							{typeof error.data === 'object' && error.data && 'message' in error.data
								? String(error.data.message)
								: 'You do not have permission to access this page.'}
						</p>
						<Button asChild>
							<Link to="/">Back to Home</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}
