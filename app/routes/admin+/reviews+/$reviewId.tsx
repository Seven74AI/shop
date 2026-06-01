import { parseWithZod } from '@conform-to/zod/v4'
import { data, Link } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { cn } from '#app/utils/misc.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$reviewId.ts'

const SingleActionSchema = z.object({
	intent: z.enum(['approve', 'reject'], {
		error: 'Intent must be "approve" or "reject"',
	}),
	rejectionReason: z.string().optional(),
})

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const review = await prisma.review.findUnique({
		where: { id: params.reviewId },
		include: {
			product: {
				select: { id: true, name: true, slug: true },
			},
			user: {
				select: { id: true, name: true, username: true },
			},
			order: {
				select: { id: true, orderNumber: true },
			},
		},
	})

	if (!review) {
		throw data({ message: 'Review not found' }, { status: 404 })
	}

	return { review }
}

export async function action({ request, params }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: SingleActionSchema,
	})

	if (submission.status !== 'success') {
		return data(
			submission.reply(),
			{ status: 400 },
		)
	}

	const { intent, rejectionReason } = submission.value

	if (intent === 'approve') {
		await prisma.review.update({
			where: { id: params.reviewId },
			data: { isApproved: true, rejectionReason: null },
		})
		return redirectWithToast('/admin/reviews', {
			type: 'success',
			title: 'Review approved',
			description: 'The review has been approved and is now visible.',
		})
	}

	// Reject
	await prisma.review.update({
		where: { id: params.reviewId },
		data: {
			isApproved: false,
			rejectionReason: rejectionReason || 'Rejected by admin',
		},
	})
	return redirectWithToast('/admin/reviews', {
		type: 'success',
		title: 'Review rejected',
		description: 'The review has been rejected.',
	})
}

export const meta: Route.MetaFunction = ({ data }) => [
	{ title: `${data?.review?.title || 'Review'} | Admin | Epic Shop` },
]

function StarRating({ rating }: { rating: number }) {
	return (
		<div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
			{Array.from({ length: 5 }, (_, i) => (
				<Icon
					key={i}
					name="star"
					className={cn(
						'h-5 w-5',
						i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30',
					)}
				/>
			))}
		</div>
	)
}

export default function ReviewDetail({ loaderData }: Route.ComponentProps) {
	const { review } = loaderData

	return (
		<div className="space-y-8 animate-slide-top max-w-3xl">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Review Detail
					</h1>
					<Link
						to="/admin/reviews"
						className="text-sm text-muted-foreground hover:underline"
					>
						<Icon name="arrow-left" className="h-3 w-3 inline mr-1" />
						Back to reviews
					</Link>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" asChild>
						<Link to={`/admin/reviews/${review.id}/edit`}>
							<Icon name="pencil-1" className="h-4 w-4 mr-1" />
							Edit
						</Link>
					</Button>
				</div>
			</div>

			{/* Status */}
			<Card className="rounded-[14px]">
				<CardContent className="p-6">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div>
								<p className="text-sm text-muted-foreground">Status</p>
								<div className="flex items-center gap-2 mt-1">
									{review.rejectionReason ? (
										<Badge variant="destructive">Rejected</Badge>
									) : review.isApproved ? (
										<Badge variant="success">Approved</Badge>
									) : (
										<Badge variant="secondary">Pending</Badge>
									)}
									{review.isVerifiedPurchase && (
										<Badge variant="outline" className="text-xs">Verified Purchase</Badge>
									)}
								</div>
							</div>
						</div>
						<div className="flex items-center gap-2">
							{!review.isApproved && !review.rejectionReason && (
								<form method="POST">
									<input type="hidden" name="intent" value="approve" />
									<Button type="submit" size="sm" variant="default">
										<Icon name="check" className="h-4 w-4 mr-1" />
										Approve
									</Button>
								</form>
							)}
							{!review.rejectionReason && (
								<form method="POST">
									<input type="hidden" name="intent" value="reject" />
									<Button type="submit" size="sm" variant="destructive">
										<Icon name="cross-1" className="h-4 w-4 mr-1" />
										Reject
									</Button>
								</form>
							)}
						</div>
					</div>
					{review.rejectionReason && (
						<div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
							<p className="text-sm font-medium text-destructive">Rejection Reason</p>
							<p className="text-sm mt-1">{review.rejectionReason}</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Review Content */}
			<Card className="rounded-[14px]">
				<CardHeader>
					<CardTitle className="text-base font-normal">
						{review.title || 'No title'}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<StarRating rating={review.rating} />
					{review.body ? (
						<p className="text-muted-foreground whitespace-pre-wrap">{review.body}</p>
					) : (
						<p className="text-muted-foreground italic">No content</p>
					)}
				</CardContent>
			</Card>

			{/* Details */}
			<Card className="rounded-[14px]">
				<CardHeader>
					<CardTitle className="text-base font-normal">Details</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<dt className="text-sm text-muted-foreground">Product</dt>
							<dd className="mt-1">
								<Link
									to={`/admin/products/${review.product.slug}`}
									className="text-primary hover:underline"
								>
									{review.product.name}
								</Link>
							</dd>
						</div>
						<div>
							<dt className="text-sm text-muted-foreground">User</dt>
							<dd className="mt-1">
								{review.user ? (
									<Link
										to={`/admin/users/${review.user.id}`}
										className="text-primary hover:underline"
									>
										{review.user.name || review.user.username}
									</Link>
								) : (
									<span className="text-muted-foreground italic">Anonymous</span>
								)}
							</dd>
						</div>
						{review.order && (
							<div>
								<dt className="text-sm text-muted-foreground">Order</dt>
								<dd className="mt-1">
									<Link
										to={`/admin/orders/${review.order.orderNumber}`}
										className="text-primary hover:underline"
									>
										{review.order.orderNumber}
									</Link>
								</dd>
							</div>
						)}
						<div>
							<dt className="text-sm text-muted-foreground">Submitted</dt>
							<dd className="mt-1 text-sm">
								{new Date(review.createdAt).toLocaleDateString()}
							</dd>
						</div>
						<div>
							<dt className="text-sm text-muted-foreground">Last Updated</dt>
							<dd className="mt-1 text-sm">
								{new Date(review.updatedAt).toLocaleDateString()}
							</dd>
						</div>
					</dl>
				</CardContent>
			</Card>
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
				404: () => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon name="file-text" className="h-12 w-12 text-muted-foreground" />
						<h2 className="text-xl font-semibold">Review Not Found</h2>
						<p className="text-muted-foreground">
							The review you are looking for does not exist.
						</p>
						<Button asChild>
							<Link to="/admin/reviews">Back to Reviews</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}
