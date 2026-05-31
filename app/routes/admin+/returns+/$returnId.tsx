import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data, Link } from 'react-router'
import { z } from 'zod'
import { ReturnStatusBadge } from '#app/components/return-status-badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getReturnRequestById } from '#app/utils/return-queries.server.ts'
import { getReturnStatusLabel } from '#app/utils/return-status.ts'
import { updateReturnStatus } from '#app/utils/return.server.ts'
import { processReturnRefund } from '#app/utils/order.server.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$returnId.ts'
import { ReturnManagementCard } from './__return-management-card.tsx'

const StatusUpdateSchema = z.object({
	status: z.enum(
		['REQUESTED', 'APPROVED', 'SHIPPED', 'RECEIVED', 'REFUNDED', 'REJECTED'],
		{
			error:
				'Status must be one of: REQUESTED, APPROVED, SHIPPED, RECEIVED, REFUNDED, REJECTED',
		},
	),
	adminNotes: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? undefined
					: 'Admin notes must be a string',
		})
		.optional(),
	refundAmountCents: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? undefined
					: 'Refund amount must be a string',
		})
		.optional(),
	restockingFeeCents: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? undefined
					: 'Restocking fee must be a string',
		})
		.optional(),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { returnId } = params

	const returnRequest = await getReturnRequestById(returnId)

	invariantResponse(returnRequest, 'Return request not found', {
		status: 404,
	})

	const currency = await getStoreCurrency()

	return {
		returnRequest,
		currency,
	}
}

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: StatusUpdateSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { returnId } = params
	const { status, adminNotes, refundAmountCents, restockingFeeCents } =
		submission.value

	try {
		if (status === 'REFUNDED') {
			// Process the full refund via Stripe + credit note
			await processReturnRefund(returnId, request)
		} else {
			await updateReturnStatus(
				returnId,
				status,
				adminNotes || null,
				refundAmountCents ? parseInt(refundAmountCents, 10) : null,
				restockingFeeCents ? parseInt(restockingFeeCents, 10) : null,
			)
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'An unexpected error occurred'
		return data({ error: message }, { status: 400 })
	}

	const statusLabel = getReturnStatusLabel(status)

	return redirectWithToast(`/admin/returns/${returnId}`, {
		type: 'success',
		title: 'Return Updated',
		description: `Return status updated to ${statusLabel}.`,
	})
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.returnRequest) {
		return [{ title: 'Return Not Found | Admin | Epic Shop' }]
	}
	return [
		{
			title: `Return ${loaderData.returnRequest.id} | Admin | Epic Shop`,
		},
		{
			name: 'description',
			content: `View and manage return request ${loaderData.returnRequest.id}`,
		},
	]
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$returnId.lazy')
