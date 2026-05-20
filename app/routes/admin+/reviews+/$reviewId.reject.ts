import { invariantResponse } from '@epic-web/invariant'
import { data, redirect } from 'react-router'
import { z } from 'zod'
import { withAudit } from '#app/utils/audit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$reviewId.reject.ts'

const RejectReviewSchema = z.object({
	reviewId: z.string().min(1),
})

export async function action({ params, request }: Route.ActionArgs) {
	const userId = await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = RejectReviewSchema.safeParse(
		Object.fromEntries(formData),
	)

	if (!submission.success) {
		return data({ errors: submission.error.flatten() }, { status: 400 })
	}

	const review = await prisma.review.findUnique({
		where: { id: submission.data.reviewId },
		select: { id: true, status: true },
	})

	invariantResponse(review, 'Review not found', { status: 404 })

	await withAudit(
		{
			action: 'review.rejected',
			entityType: 'Review',
			entityId: review.id,
			actorUserId: userId,
			getBefore: () =>
				prisma.review.findUnique({ where: { id: review.id } }),
			getAfter: () =>
				prisma.review.findUnique({ where: { id: review.id } }),
		},
		async () => {
			return prisma.review.update({
				where: { id: review.id },
				data: { status: 'REJECTED' },
			})
		},
	)

	throw redirectWithToast('/admin/reviews', {
		type: 'success',
		description: `Review ${review.id.slice(0, 8)} rejected.`,
	})
}

export async function loader() {
	return redirect('/admin/reviews')
}
