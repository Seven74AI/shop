import { invariantResponse } from '@epic-web/invariant'
import { data, redirect } from 'react-router'
import { z } from 'zod'
import { withAudit } from '#app/utils/audit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$reviewId.delete.ts'

const DeleteReviewSchema = z.object({
	reviewId: z.string().min(1),
})

export async function action({ params, request }: Route.ActionArgs) {
	const userId = await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = DeleteReviewSchema.safeParse(
		Object.fromEntries(formData),
	)

	if (!submission.success) {
		return data({ errors: submission.error.flatten() }, { status: 400 })
	}

	const review = await prisma.review.findUnique({
		where: { id: submission.data.reviewId },
		select: { id: true, body: true },
	})

	invariantResponse(review, 'Review not found', { status: 404 })

	await withAudit(
		{
			action: 'review.deleted',
			entityType: 'Review',
			entityId: review.id,
			actorUserId: userId,
			getBefore: () =>
				prisma.review.findUnique({ where: { id: review.id } }),
			getAfter: () => Promise.resolve(null),
		},
		async () => {
			return prisma.review.delete({
				where: { id: review.id },
			})
		},
	)

	throw redirectWithToast('/admin/reviews', {
		type: 'success',
		description: `Review ${review.id.slice(0, 8)} permanently deleted.`,
	})
}

export async function loader() {
	return redirect('/admin/reviews')
}
