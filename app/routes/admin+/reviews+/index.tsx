import { useState, useMemo } from 'react'
import { Form, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
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
import { getAllReviews } from '#app/utils/reviews.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { reviews, total } = await getAllReviews()

	return { reviews, total }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Reviews | Admin | Epic Shop' },
	{ name: 'description', content: 'Moderate product reviews' },
]

const ITEMS_PER_PAGE = 25

function ReviewStatusBadge({ status }: { status: string }) {
	switch (status) {
		case 'APPROVED':
			return (
				<Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
					Approved
				</Badge>
			)
		case 'PENDING':
			return (
				<Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
					Pending
				</Badge>
			)
		case 'REJECTED':
			return (
				<Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
					Rejected
				</Badge>
			)
		default:
			return <Badge>{status}</Badge>
	}
}

function StarRating({ rating }: { rating: number }) {
	return (
		<span className="inline-flex items-center gap-0.5 text-sm">
			{[1, 2, 3, 4, 5].map((star) => (
				<span
					key={star}
					className={star <= rating ? 'text-yellow-400' : 'text-muted-foreground/30'}
				>
					{star <= rating ? '★' : '☆'}
				</span>
			))}
		</span>
	)
}

export default function ReviewsList({ loaderData }: Route.ComponentProps) {
	const { reviews, total } = loaderData

	// State for search and filtering
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState('all')
	const [currentPage, setCurrentPage] = useState(1)

	// Filter reviews based on search and filter criteria
	const filteredReviews = useMemo(() => {
		let filtered = reviews

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(review) =>
					review.body.toLowerCase().includes(search) ||
					review.title?.toLowerCase().includes(search) ||
					review.user?.username?.toLowerCase().includes(search) ||
					review.user?.name?.toLowerCase().includes(search) ||
					review.product?.name.toLowerCase().includes(search),
			)
		}

		// Apply status filter
		if (statusFilter !== 'all') {
			filtered = filtered.filter(
				(review) => review.status === statusFilter,
			)
		}

		return filtered
	}, [reviews, searchTerm, statusFilter])

	// Pagination calculations
	const totalPages = Math.ceil(filteredReviews.length / ITEMS_PER_PAGE)
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const endIndex = startIndex + ITEMS_PER_PAGE
	const paginatedReviews = filteredReviews.slice(startIndex, endIndex)

	// Reset to page 1 when filters change
	// (handled inline in the setter)

	const handleFilterChange = (filter: string) => {
		setStatusFilter(filter)
		setCurrentPage(1)
	}

	const handleSearchChange = (value: string) => {
		setSearchTerm(value)
		setCurrentPage(1)
	}

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with title */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Reviews
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Moderate product reviews ({total} total)
						{searchTerm.trim() || statusFilter !== 'all'
							? ` • ${filteredReviews.length} shown`
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
							placeholder="Search reviews by text, user, or product..."
							value={searchTerm}
							onChange={(e) => handleSearchChange(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select
						value={statusFilter}
						onValueChange={handleFilterChange}
					>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by status"
						>
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							<SelectItem value="PENDING">
								Pending
							</SelectItem>
							<SelectItem value="APPROVED">
								Approved
							</SelectItem>
							<SelectItem value="REJECTED">
								Rejected
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Reviews Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Product</TableHead>
						<TableHead>User</TableHead>
						<TableHead>Rating</TableHead>
						<TableHead className="hidden md:table-cell">
							Review
						</TableHead>
						<TableHead className="hidden md:table-cell">
							Date
						</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredReviews.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={7}
								className="text-center py-8"
							>
								{searchTerm.trim() ||
								statusFilter !== 'all' ? (
									<div className="text-muted-foreground">
										<Icon
											name="magnifying-glass"
											className="h-8 w-8 mx-auto mb-2 opacity-50"
										/>
										<p>
											No reviews match your search
											criteria.
										</p>
										<p className="text-sm">
											Try adjusting your search or
											filters.
										</p>
									</div>
								) : (
									<div className="text-muted-foreground">
										<span className="text-4xl block mb-2 opacity-50">★</span>
										<p>No reviews found.</p>
										<p className="text-sm">
											Customer reviews will appear here
											once submitted.
										</p>
									</div>
								)}
							</TableCell>
						</TableRow>
					) : (
						paginatedReviews.map((review) => (
							<TableRow
								key={review.id}
								className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top"
							>
								<TableCell>
									<Link
										to={`/shop/products/${review.product.slug}`}
										className="font-medium text-primary hover:underline transition-colors duration-200"
									>
										{review.product.name}
									</Link>
								</TableCell>
								<TableCell>
								<span className="text-muted-foreground">
									{review.user?.username ||
										review.user?.name ||
										'Unknown'}
								</span>
								</TableCell>
								<TableCell>
									<StarRating rating={review.rating} />
								</TableCell>
								<TableCell className="hidden md:table-cell max-w-xs">
									<div>
										{review.title && (
											<p className="font-medium text-sm truncate">
												{review.title}
											</p>
										)}
										<p className="text-sm text-muted-foreground line-clamp-2">
											{review.body}
										</p>
										{review.isVerifiedPurchase && (
											<span className="text-xs text-green-600 dark:text-green-400 mt-1 inline-flex items-center gap-1">
												<Icon
													name="check"
													className="h-3 w-3"
												/>
												Verified Purchase
											</span>
										)}
									</div>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="text-muted-foreground text-sm">
										{new Date(
											review.createdAt,
										).toLocaleDateString()}
									</span>
								</TableCell>
								<TableCell>
									<ReviewStatusBadge
										status={review.status}
									/>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-1">
										{review.status === 'PENDING' && (
											<>
												<Form
													method="post"
													action={`/admin/reviews/${review.id}/approve`}
												>
													<input
														type="hidden"
														name="reviewId"
														value={review.id}
													/>
													<Button
														variant="ghost"
														size="sm"
														type="submit"
														aria-label={`Approve review ${review.id.slice(0, 8)}`}
														className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
													>
														<Icon
															name="check"
															className="h-4 w-4"
														/>
													</Button>
												</Form>
												<Form
													method="post"
													action={`/admin/reviews/${review.id}/reject`}
												>
													<input
														type="hidden"
														name="reviewId"
														value={review.id}
													/>
													<Button
														variant="ghost"
														size="sm"
														type="submit"
														aria-label={`Reject review ${review.id.slice(0, 8)}`}
														className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
													>
														<Icon
															name="cross-1"
															className="h-4 w-4"
														/>
													</Button>
												</Form>
											</>
										)}
										<Form
											method="post"
											action={`/admin/reviews/${review.id}/delete`}
										>
											<input
												type="hidden"
												name="reviewId"
												value={review.id}
											/>
											<Button
												variant="ghost"
												size="sm"
												type="submit"
												aria-label={`Delete review ${review.id.slice(0, 8)}`}
												className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
											>
												<Icon
													name="trash"
													className="h-4 w-4"
												/>
											</Button>
										</Form>
									</div>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Showing {startIndex + 1} to{' '}
						{Math.min(endIndex, filteredReviews.length)} of{' '}
						{filteredReviews.length} reviews
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === 1}
							onClick={() =>
								setCurrentPage((p) => Math.max(1, p - 1))
							}
						>
							<Icon name="arrow-left" className="h-4 w-4" />
							Previous
						</Button>
						<div className="flex items-center gap-1">
							{Array.from(
								{ length: totalPages },
								(_, i) => i + 1,
							)
								.filter(
									(page) =>
										page === 1 ||
										page === totalPages ||
										Math.abs(page - currentPage) <= 1,
								)
								.map((page, index, arr) => (
									<div
										key={page}
										className="flex items-center gap-1"
									>
										{index > 0 &&
											arr[index - 1] !== page - 1 && (
												<span className="px-2 text-muted-foreground">
													...
												</span>
											)}
										<Button
											variant={
												currentPage === page
													? 'default'
													: 'outline'
											}
											size="sm"
											onClick={() =>
												setCurrentPage(page)
											}
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
								setCurrentPage((p) =>
									Math.min(totalPages, p + 1),
								)
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
						<h2 className="text-xl font-semibold">
							Unauthorized
						</h2>
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
