import { useMemo, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
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
import { cn } from '#app/utils/misc.tsx'
import type { loader } from './index.ts'
import type { Route } from './+types/index.ts'

const REVIEW_STATUS_OPTIONS = ['all', 'pending', 'approved', 'rejected'] as const

function ReviewStatusBadge({ isApproved, rejectionReason }: { isApproved: boolean; rejectionReason: string | null }) {
	if (rejectionReason) {
		return <Badge variant="destructive">Rejected</Badge>
	}
	if (isApproved) {
		return <Badge variant="success">Approved</Badge>
	}
	return <Badge variant="secondary">Pending</Badge>
}

function VerifiedBadge({ isVerified }: { isVerified: boolean }) {
	if (!isVerified) return null
	return <Badge variant="outline" className="text-xs ml-1">Verified</Badge>
}

function StarRating({ rating }: { rating: number }) {
	return (
		<div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
			{Array.from({ length: 5 }, (_, i) => (
				<Icon
					key={i}
					name="star"
					className={cn(
						'h-4 w-4',
						i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30',
					)}
				/>
			))}
		</div>
	)
}

const ITEMS_PER_PAGE = 25

export default function ReviewsList({ loaderData }: Route.ComponentProps) {
	const { reviews, products, activeStatus, activeProduct, activeRating } = loaderData

	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter] = useState(activeStatus)
	const [productFilter] = useState(activeProduct)
	const [ratingFilter] = useState(activeRating)
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [currentPage, setCurrentPage] = useState(1)

	const filteredReviews = useMemo(() => {
		let filtered = reviews

		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(r) =>
					r.title?.toLowerCase().includes(search) ||
					r.body?.toLowerCase().includes(search) ||
					r.product?.name.toLowerCase().includes(search) ||
					r.user?.name?.toLowerCase().includes(search) ||
					r.user?.username.toLowerCase().includes(search),
			)
		}

		return filtered
	}, [reviews, searchTerm])

	const totalPages = Math.ceil(filteredReviews.length / ITEMS_PER_PAGE)
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const endIndex = startIndex + ITEMS_PER_PAGE
	const paginatedReviews = filteredReviews.slice(startIndex, endIndex)

	const allSelected = paginatedReviews.length > 0 && paginatedReviews.every((r) => selectedIds.has(r.id))
	const someSelected = paginatedReviews.some((r) => selectedIds.has(r.id))

	const toggleAll = () => {
		if (allSelected) {
			setSelectedIds(new Set())
		} else {
			setSelectedIds(new Set(paginatedReviews.map((r) => r.id)))
		}
	}

	const toggleReview = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}
			return next
		})
	}

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Product Reviews
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Moderate reviews ({reviews.length} total)
						{searchTerm.trim() ? ` • ${filteredReviews.length} shown` : ''}
					</p>
				</div>
			</div>

			{/* Filter Links */}
			<div className="flex gap-2 flex-wrap">
				{REVIEW_STATUS_OPTIONS.map((status) => (
					<Button
						key={status}
						variant={activeStatus === status ? 'default' : 'outline'}
						size="sm"
						asChild
						className="rounded-full"
					>
						<Link
							to={`/admin/reviews?status=${status}&product=${activeProduct}&rating=${activeRating}`}
							preventScrollReset
						>
							{status.charAt(0).toUpperCase() + status.slice(1)}
						</Link>
					</Button>
				))}
			</div>

			{/* Search */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon
							name="magnifying-glass"
							className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<Input
							placeholder="Search reviews by title, content, product, or user..."
							value={searchTerm}
							onChange={(e) => {
								setSearchTerm(e.target.value)
								setCurrentPage(1)
							}}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select
						value={activeProduct || 'all'}
						onValueChange={(val) => {
							window.location.href = `/admin/reviews?status=${activeStatus}&product=${val}&rating=${activeRating}`
						}}
					>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by product"
						>
							<SelectValue placeholder="Filter by product" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Products</SelectItem>
							{products.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="sm:w-48">
					<Select
						value={activeRating || 'all'}
						onValueChange={(val) => {
							window.location.href = `/admin/reviews?status=${activeStatus}&product=${activeProduct}&rating=${val}`
						}}
					>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by rating"
						>
							<SelectValue placeholder="Filter by rating" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Ratings</SelectItem>
							{[5, 4, 3, 2, 1].map((r) => (
								<SelectItem key={r} value={String(r)}>
									{r} Star{r !== 1 ? 's' : ''}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Bulk Actions */}
			{selectedIds.size > 0 && (
				<BulkActionsBar
					selectedCount={selectedIds.size}
					selectedIds={[...selectedIds]}
					onClear={() => setSelectedIds(new Set())}
				/>
			)}

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-10">
							<Checkbox
								checked={allSelected}
								aria-checked={someSelected && !allSelected ? 'mixed' : undefined}
								onCheckedChange={toggleAll}
								aria-label="Select all reviews"
							/>
						</TableHead>
						<TableHead>Review</TableHead>
						<TableHead className="hidden md:table-cell">Product</TableHead>
						<TableHead className="hidden md:table-cell">User</TableHead>
						<TableHead>Rating</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="hidden lg:table-cell">Date</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredReviews.length === 0 ? (
						<TableRow>
							<TableCell colSpan={8} className="text-center py-8">
								<div className="text-muted-foreground">
									<Icon name="magnifying-glass" className="h-8 w-8 mx-auto mb-2 opacity-50" />
									<p>No reviews found.</p>
									<p className="text-sm">
										{searchTerm.trim()
											? 'Try adjusting your search or filters.'
											: 'No reviews have been submitted yet.'}
									</p>
								</div>
							</TableCell>
						</TableRow>
					) : (
						paginatedReviews.map((review) => (
							<TableRow
								key={review.id}
								className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top"
							>
								<TableCell>
									<Checkbox
										checked={selectedIds.has(review.id)}
										onCheckedChange={() => toggleReview(review.id)}
										aria-label={`Select review by ${review.user?.name || review.user?.username || 'user'}`}
									/>
								</TableCell>
								<TableCell>
									<div className="flex flex-col gap-1">
										<div className="flex items-center gap-2">
											<Link
												to={`/admin/reviews/${review.id}`}
												className="font-medium text-primary hover:underline transition-colors duration-200 line-clamp-1"
											>
												{review.title || 'No title'}
											</Link>
											{review.isVerifiedPurchase && <VerifiedBadge isVerified />}
										</div>
										{review.body && (
											<p className="text-sm text-muted-foreground line-clamp-2">
												{review.body}
											</p>
										)}
									</div>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									{review.product ? (
										<Link
											to={`/admin/products/${review.product.slug}`}
											className="text-muted-foreground hover:underline text-sm"
										>
											{review.product.name}
										</Link>
									) : (
										<span className="text-muted-foreground text-sm">—</span>
									)}
								</TableCell>
								<TableCell className="hidden md:table-cell">
									{review.user ? (
										<span className="text-muted-foreground text-sm">
											{review.user.name || review.user.username}
										</span>
									) : (
										<span className="text-muted-foreground text-sm italic">Anonymous</span>
									)}
								</TableCell>
								<TableCell>
									<StarRating rating={review.rating} />
								</TableCell>
								<TableCell>
									<ReviewStatusBadge
										isApproved={review.isApproved}
										rejectionReason={review.rejectionReason}
									/>
								</TableCell>
								<TableCell className="hidden lg:table-cell">
									<span className="text-muted-foreground text-sm">
										{new Date(review.createdAt).toLocaleDateString()}
									</span>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-1">
										<SingleReviewActions review={review} />
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
						Showing {startIndex + 1} to {Math.min(endIndex, filteredReviews.length)} of{' '}
						{filteredReviews.length} reviews
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
											<span className="px-2 text-muted-foreground">...</span>
										)}
										<Button
											variant={currentPage === page ? 'default' : 'outline'}
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
							onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

function BulkActionsBar({
	selectedCount,
	selectedIds,
	onClear,
}: {
	selectedCount: number
	selectedIds: string[]
	onClear: () => void
}) {
	const fetcher = useFetcher()

	return (
		<div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg border">
			<span className="text-sm font-medium">
				{selectedCount} review{selectedCount !== 1 ? 's' : ''} selected
			</span>
			<fetcher.Form method="POST" className="flex items-center gap-2">
				<input type="hidden" name="reviewIds" value={selectedIds.join(',')} />
				<Button
					type="submit"
					name="action"
					value="approve"
					variant="default"
					size="sm"
					disabled={fetcher.state !== 'idle'}
				>
					<Icon name="check" className="h-4 w-4 mr-1" />
					Approve All
				</Button>
				<Button
					type="submit"
					name="action"
					value="reject"
					variant="destructive"
					size="sm"
					disabled={fetcher.state !== 'idle'}
				>
					<Icon name="cross-1" className="h-4 w-4 mr-1" />
					Reject All
				</Button>
			</fetcher.Form>
			<Button variant="ghost" size="sm" onClick={onClear}>
				Clear selection
			</Button>
		</div>
	)
}

function SingleReviewActions({ review }: { review: Route.ComponentProps['loaderData']['reviews'][number] }) {
	const approveFetcher = useFetcher()
	const rejectFetcher = useFetcher()

	return (
		<>
			<Button variant="ghost" size="sm" asChild>
				<Link to={`/admin/reviews/${review.id}`} aria-label={`View review by ${review.user?.name || 'user'}`}>
					<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
				</Link>
			</Button>
			<Button variant="ghost" size="sm" asChild>
				<Link to={`/admin/reviews/${review.id}/edit`} aria-label="Edit review">
					<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
				</Link>
			</Button>
			{!review.isApproved && !review.rejectionReason && (
				<approveFetcher.Form method="POST">
					<input type="hidden" name="reviewIds" value={review.id} />
					<input type="hidden" name="action" value="approve" />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						disabled={approveFetcher.state !== 'idle'}
						aria-label="Approve review"
					>
						<Icon name="check" className="h-4 w-4 text-green-600" aria-hidden="true" />
					</Button>
				</approveFetcher.Form>
			)}
			{!review.rejectionReason && (
				<rejectFetcher.Form method="POST">
					<input type="hidden" name="reviewIds" value={review.id} />
					<input type="hidden" name="action" value="reject" />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						disabled={rejectFetcher.state !== 'idle'}
						aria-label="Reject review"
					>
						<Icon name="cross-1" className="h-4 w-4 text-destructive" aria-hidden="true" />
					</Button>
				</rejectFetcher.Form>
			)}
		</>
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
