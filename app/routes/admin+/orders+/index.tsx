import { Form, Link, useSearchParams, useSubmit } from 'react-router'
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
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { getPaginatedOrders } from '#app/utils/order.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Parse search params from URL
	const url = new URL(request.url)
	const search = url.searchParams.get('search') ?? ''
	const status = url.searchParams.get('status') ?? 'all'
	const page = Number(url.searchParams.get('page') ?? '1')

	// Server-side paginated + filtered query
	const result = await getPaginatedOrders({
		search,
		status,
		page: page > 0 ? page : 1,
		limit: 25,
	})

	const currency = await getStoreCurrency()

	return {
		...result,
		currency,
		// Pass current filters back for form defaults
		currentSearch: search,
		currentStatus: status,
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Orders | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage all orders' },
]

export default function OrdersList({ loaderData }: Route.ComponentProps) {
	const {
		orders,
		total,
		page,
		totalPages,
		limit,
		currency,
		currentSearch,
		currentStatus,
	} = loaderData

	const [searchParams] = useSearchParams()
	const submit = useSubmit()

	const startIndex = (page - 1) * limit + 1
	const endIndex = Math.min(page * limit, total)

	// Build page URL with current filters preserved
	function pageUrl(pageNum: number) {
		const params = new URLSearchParams(searchParams)
		params.set('page', String(pageNum))
		return `?${params.toString()}`
	}

	// Handle status filter change -> navigate with updated params
	function handleStatusChange(newStatus: string) {
		const params = new URLSearchParams(searchParams)
		if (newStatus === 'all') {
			params.delete('status')
		} else {
			params.set('status', newStatus)
		}
		params.delete('page') // Reset to page 1 on filter change
		params.delete('search') // Clear search when changing status filter
		void submit(params, { method: 'get', action: '/admin/orders' })
	}

	const isFiltered = currentSearch.trim() || currentStatus !== 'all'

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with title */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Orders</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage all orders ({total} total)
						{isFiltered ? ` • ${total} shown` : ''}
					</p>
				</div>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				{/* Search: uses Form GET with submit button */}
				<Form method="get" className="flex-1 flex gap-2">
					{/* Preserve status filter when searching */}
					{currentStatus !== 'all' && (
						<input type="hidden" name="status" value={currentStatus} />
					)}
					<div className="relative flex-1">
						<Icon
							name="magnifying-glass"
							className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<Input
							placeholder="Search orders by order number or email..."
							name="search"
							defaultValue={currentSearch}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
					<Button type="submit" variant="secondary" size="default">
						<Icon name="magnifying-glass" className="h-4 w-4 mr-2" />
						Search
					</Button>
					{currentSearch && (
						<Button variant="ghost" size="default" asChild>
							<Link to={currentStatus !== 'all' ? `?status=${currentStatus}` : '?'}>
								Clear
							</Link>
						</Button>
					)}
				</Form>

				{/* Status filter: controlled Select that navigates via submit */}
				<div className="sm:w-48">
					<Select
						value={currentStatus}
						onValueChange={handleStatusChange}
					>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by status"
						>
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							<SelectItem value="PENDING">Pending</SelectItem>
							<SelectItem value="CONFIRMED">Confirmed</SelectItem>
							<SelectItem value="SHIPPED">Shipped</SelectItem>
							<SelectItem value="DELIVERED">Delivered</SelectItem>
							<SelectItem value="CANCELLED">Cancelled</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Active filter indicator */}
			{isFiltered && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<span>Active filters:</span>
					{currentStatus !== 'all' && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
							Status: {currentStatus}
							<button
								type="button"
								onClick={() => handleStatusChange('all')}
								className="ml-1 hover:text-primary/70"
								aria-label={`Remove ${currentStatus} filter`}
							>
								×
							</button>
						</span>
					)}
					{currentSearch && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
							Search: {currentSearch}
							<Link
								to={currentStatus !== 'all' ? `?status=${currentStatus}` : '?'}
								className="ml-1 hover:text-primary/70"
								aria-label="Clear search"
							>
								×
							</Link>
						</span>
					)}
				</div>
			)}

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Order Number</TableHead>
						<TableHead className="hidden md:table-cell">Customer</TableHead>
						<TableHead className="hidden md:table-cell">Email</TableHead>
						<TableHead className="hidden lg:table-cell">Items</TableHead>
						<TableHead>Total</TableHead>
						<TableHead className="hidden md:table-cell">Date</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{orders.length === 0 ? (
						<TableRow>
							<TableCell colSpan={8} className="text-center py-8">
								{isFiltered ? (
									<div className="text-muted-foreground">
										<Icon
											name="magnifying-glass"
											className="h-8 w-8 mx-auto mb-2 opacity-50"
										/>
										<p>No orders match your search criteria.</p>
										<p className="text-sm">Try adjusting your search or filters.</p>
									</div>
								) : (
									<div className="text-muted-foreground">
										<Icon name="archive" className="h-8 w-8 mx-auto mb-2 opacity-50" />
										<p>No orders found.</p>
										<p className="text-sm">You haven't received any orders yet.</p>
									</div>
								)}
							</TableCell>
						</TableRow>
					) : (
						orders.map((order) => {
							const itemCount = order.items.reduce(
								(sum, item) => sum + item.quantity,
								0,
							)

							return (
								<TableRow
									key={order.id}
									className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top"
								>
									<TableCell>
										<Link
											to={`/admin/orders/${order.orderNumber}`}
											className="font-medium text-primary hover:underline transition-colors duration-200"
											aria-label={`View order ${order.orderNumber}`}
										>
											{order.orderNumber}
										</Link>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">
											{order.user?.name || order.shippingName || 'Guest'}
										</span>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">{order.email}</span>
									</TableCell>
									<TableCell className="hidden lg:table-cell">
										<span className="text-muted-foreground">{itemCount} items</span>
									</TableCell>
									<TableCell>
										<span className="font-medium">
											{formatPrice(order.total, currency)}
										</span>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">
											{new Date(order.createdAt).toLocaleDateString()}
										</span>
									</TableCell>
									<TableCell>
										<OrderStatusBadge status={order.status} />
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button variant="ghost" size="sm" asChild>
												<Link
													to={`/admin/orders/${order.orderNumber}`}
													aria-label={`View order ${order.orderNumber}`}
												>
													<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
												</Link>
											</Button>
										</div>
									</TableCell>
								</TableRow>
							)
						})
					)}
				</TableBody>
			</Table>

			{/* Pagination — server-side, URL-based */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Showing {startIndex} to {endIndex} of {total} orders
					</div>
					<div className="flex items-center gap-2">
						{page > 1 ? (
							<Button variant="outline" size="sm" asChild>
								<Link to={pageUrl(page - 1)}>
									<Icon name="arrow-left" className="h-4 w-4" />
									Previous
								</Link>
							</Button>
						) : (
							<Button variant="outline" size="sm" disabled>
								<Icon name="arrow-left" className="h-4 w-4" />
								Previous
							</Button>
						)}
						<div className="flex items-center gap-1">
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(
									(p) =>
										p === 1 ||
										p === totalPages ||
										Math.abs(p - page) <= 1,
								)
								.map((p, index, arr) => (
									<div key={p} className="flex items-center gap-1">
										{index > 0 && arr[index - 1] !== p - 1 && (
											<span className="px-2 text-muted-foreground">...</span>
										)}
										<Button
											variant={page === p ? 'default' : 'outline'}
											size="sm"
											asChild
											className="min-w-[2.5rem]"
										>
											<Link to={pageUrl(p)}>{p}</Link>
										</Button>
									</div>
								))}
						</div>
						{page < totalPages ? (
							<Button variant="outline" size="sm" asChild>
								<Link to={pageUrl(page + 1)}>
									Next
									<Icon name="arrow-right" className="h-4 w-4" />
								</Link>
							</Button>
						) : (
							<Button variant="outline" size="sm" disabled>
								Next
								<Icon name="arrow-right" className="h-4 w-4" />
							</Button>
						)}
					</div>
				</div>
			)}
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
							<Link to="/admin">Back to Dashboard</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}
