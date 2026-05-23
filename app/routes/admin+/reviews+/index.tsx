import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/index.ts'

// Schema for bulk moderation actions
const BulkActionSchema = z.object({
	action: z.enum(['approve', 'reject'], {
		error: 'Action must be either "approve" or "reject"',
	}),
	reviewIds: z.string().min(1, 'At least one review must be selected'),
	rejectionReason: z.string().optional(),
})

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const statusFilter = url.searchParams.get('status') || 'all'
	const productFilter = url.searchParams.get('product') || 'all'
	const ratingFilter = url.searchParams.get('rating')

	const where: Record<string, unknown> = {}

	if (statusFilter === 'pending') {
		where.isApproved = false
		where.rejectionReason = null
	} else if (statusFilter === 'approved') {
		where.isApproved = true
	} else if (statusFilter === 'rejected') {
		where.rejectionReason = { not: null }
	}

	if (productFilter !== 'all') {
		where.productId = productFilter
	}

	if (ratingFilter) {
		where.rating = parseInt(ratingFilter, 10)
	}

	const [reviews, products] = await Promise.all([
		prisma.review.findMany({
			where,
			include: {
				product: {
					select: { id: true, name: true, slug: true },
				},
				user: {
					select: { id: true, name: true, username: true },
				},
			},
			orderBy: { createdAt: 'desc' },
		}),
		prisma.product.findMany({
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		}),
	])

	return {
		reviews,
		products,
		activeStatus: statusFilter,
		activeProduct: productFilter,
		activeRating: ratingFilter || '',
	}
}

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: BulkActionSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { action: bulkAction, reviewIds, rejectionReason } = submission.value
	const ids = reviewIds.split(',').filter(Boolean)

	if (ids.length === 0) {
		return data(
			{ result: submission.reply({ fieldErrors: { reviewIds: ['No valid review IDs provided'] } }) },
			{ status: 400 },
		)
	}

	if (bulkAction === 'approve') {
		await prisma.review.updateMany({
			where: { id: { in: ids } },
			data: { isApproved: true, rejectionReason: null },
		})
	} else {
		await prisma.review.updateMany({
			where: { id: { in: ids } },
			data: {
				isApproved: false,
				rejectionReason: rejectionReason || 'Rejected by admin',
			},
		})
	}

	const actionLabel = bulkAction === 'approve' ? 'approved' : 'rejected'

	return redirectWithToast('/admin/reviews', {
		type: 'success',
		title: `Reviews ${actionLabel}`,
		description: `${ids.length} review(s) ${actionLabel} successfully.`,
	})
}

export { default } from './__reviews-list.tsx'
