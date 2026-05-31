import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ReturnStatusBadge } from '#app/components/return-status-badge.tsx'
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
import { getAllReturnRequests } from '#app/utils/return-queries.server.ts'
import { type Route } from './+types/index.ts'



const ITEMS_PER_PAGE = 25

export default function ReturnsList({ loaderData }: Route.ComponentProps) {
	const { returns } = loaderData

	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState('all')
	const [currentPage, setCurrentPage] = useState(1)

	const filteredReturns = useMemo(() => {
		let filtered = returns

		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(r) =>
					r.order.orderNumber.toLowerCase().includes(search) ||
					r.order.email.toLowerCase().includes(search) ||
					r.reason.toLowerCase().includes(search),
			)
		}

		if (statusFilter !== 'all') {
			filtered = filtered.filter((r) => r.status === statusFilter)
		}

		return filtered
	}, [returns, searchTerm, statusFilter])

	const totalPages = Math.ceil(filteredReturns.length / ITEMS_PER_PAGE)
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const endIndex = startIndex + ITEMS_PER_PAGE
	const paginatedReturns = filteredReturns.slice(startIndex, endIndex)

	useEffect(() => {
		setCurrentPage(1)
	}, [searchTerm, statusFilter])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Returns
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage return requests ({returns.length} total)
						{searchTerm.trim() || statusFilter !== 'all'
							? ` • ${filteredReturns.length} shown`
							: ''}
					</p>
				</div>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon
							name="magnifying-glass"
							className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<Input
							placeholder="Search returns by order number, email, or reason..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={statusFilter} onValueChange={setStatusFilter}>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by status"
						>
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							<SelectItem value="REQUESTED">Requested</SelectItem>
							<SelectItem value="APPROVED">Approved</SelectItem>
							<SelectItem value="SHIPPED">Shipped</SelectItem>
							<SelectItem value="RECEIVED">Received</SelectItem>
							<SelectItem value="REFUNDED">Refunded</SelectItem>
							<SelectItem value="REJECTED">Rejected</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Order</TableHead>
						<TableHead className="hidden md:table-cell">Customer</TableHead>
						<TableHead className="hidden lg:table-cell">Reason</TableHead>
						<TableHead className="hidden md:table-cell">Items</TableHead>
						<TableHead className="hidden lg:table-cell">Requested</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredReturns.length === 0 ? (
						<TableRow>
							<TableCell colSpan={7} className="text-center py-8">
								{searchTerm.trim() || statusFilter !== 'all' ? (
									<div className="text-muted-foreground">
										<Icon
											name="magnifying-glass"
											className="h-8 w-8 mx-auto mb-2 opacity-50"
										/>
										<p>No returns match your search criteria.</p>
										<p className="text-sm">
											Try adjusting your search or filters.
										</p>
									</div>
								) : (
									<div className="text-muted-foreground">
										<Icon
											name="archive"
											className="h-8 w-8 mx-auto mb-2 opacity-50"
										/>
										<p>No return requests found.</p>
										<p className="text-sm">
											No customers have requested returns yet.
										</p>
									</div>
								)}
							</TableCell>
						</TableRow>
					) : (
						paginatedReturns.map((returnRequest) => {
							const itemCount = returnRequest.items.reduce(
								(sum, item) => sum + item.quantity,
								0,
							)

							return (
								<TableRow
									key={returnRequest.id}
									className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top"
								>
									<TableCell>
										<Link
											to={`/admin/orders/${returnRequest.order.orderNumber}`}
											className="font-medium text-primary hover:underline transition-colors duration-200"
											aria-label={`View order ${returnRequest.order.orderNumber}`}
										>
											{returnRequest.order.orderNumber}
										</Link>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">
											{returnRequest.order.email}
										</span>
									</TableCell>
									<TableCell className="hidden lg:table-cell">
										<span className="text-muted-foreground line-clamp-1">
											{returnRequest.reason}
										</span>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">
											{itemCount} items
										</span>
									</TableCell>
									<TableCell className="hidden lg:table-cell">
										<span className="text-muted-foreground">
											{new Date(
												returnRequest.requestedAt,
											).toLocaleDateString()}
										</span>
									</TableCell>
									<TableCell>
										<ReturnStatusBadge status={returnRequest.status} />
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button variant="ghost" size="sm" asChild>
												<Link
													to={`/admin/returns/${returnRequest.id}`}
													aria-label={`View return ${returnRequest.id}`}
												>
													<Icon
														name="eye-open"
														className="h-4 w-4"
														aria-hidden="true"
													/>
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

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Showing {startIndex + 1} to{' '}
						{Math.min(endIndex, filteredReturns.length)} of{' '}
						{filteredReturns.length} returns
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === 1}
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
						>
							<Icon name="arrow-left" className="h-4 w-4" />
							Previous
						</Button>
						<div className="flex items-center gap-1">
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(
									(page) =>
										page === 1 ||
										page === totalPages ||
										Math.abs(page - currentPage) <= 1,
								)
								.map((page, index, arr) => (
									<div key={page} className="flex items-center gap-1">
										{index > 0 && arr[index - 1] !== page - 1 && (
											<span className="px-2 text-muted-foreground">
												...
											</span>
										)}
										<Button
											variant={
												currentPage === page ? 'default' : 'outline'
											}
											size="sm"
											onClick={() => setCurrentPage(page)}
											className="min-w-[2.5rem]"
										>
											{page}
										</Button>
									</div>
								))}
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === totalPages}
							onClick={() =>
								setCurrentPage((p) => Math.min(totalPages, p + 1))
							}
						>
							Next
							<Icon name="arrow-right" className="h-4 w-4" />
						</Button>
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
						<Icon
							name="lock-closed"
							className="h-12 w-12 text-muted-foreground"
						/>
						<h2 className="text-xl font-semibold">Unauthorized</h2>
						<p className="text-muted-foreground text-center">
							{typeof error.data === 'object' &&
							error.data &&
							'message' in error.data
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
