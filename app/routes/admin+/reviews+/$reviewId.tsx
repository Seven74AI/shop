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

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$reviewId.lazy')
