import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { useEffect, useState } from 'react'
import { data, Link, useFetcher } from 'react-router'
import { z } from 'zod'
import { OrderStatusBadge } from '#app/components/order-status-badge.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { auditLog } from '#app/utils/audit.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { getOrderStatusLabel } from '#app/utils/order-status.ts'
import { getOrderByOrderNumber, updateOrderStatus, cancelOrder } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$orderNumber.ts'

const StatusUpdateSchema = z.object({
	status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'], {
		error: 'Status must be one of: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED',
	}),
	trackingNumber: z.string({
		error: (issue) =>
			issue.input === undefined ? undefined : 'Tracking number must be a string',
	}).optional(),
})

const CancelOrderSchema = z.object({
	intent: z.literal('cancel', {
		error: 'Invalid intent value',
	}),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { orderNumber } = params

	const order = await getOrderByOrderNumber(orderNumber)

	invariantResponse(order, 'Order not found', { status: 404 })

	const currency = await getStoreCurrency()

	return {
		order,
		currency,
	}
}

export async function action({ params, request }: Route.ActionArgs) {
	const userId = await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const intent = formData.get('intent')

	// Handle order cancellation
	if (intent === 'cancel') {
		const submission = parseWithZod(formData, {
			schema: CancelOrderSchema,
		})

		if (submission.status !== 'success') {
			return data(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const { orderNumber } = params
		const order = await getOrderByOrderNumber(orderNumber)

		invariantResponse(order, 'Order not found', { status: 404 })

		await cancelOrder(order.id, request)

		await auditLog(userId, 'UPDATE', 'Order', order.id, {
			status: { before: order.status, after: 'CANCELLED' },
			orderNumber: order.orderNumber,
		}, request)

		return redirectWithToast(`/admin/orders/${orderNumber}`, {
			type: 'success',
			title: 'Order Cancelled',
			description: `Order ${orderNumber} has been cancelled successfully`,
		})
	}

	// Handle status update
	const submission = parseWithZod(formData, {
		schema: StatusUpdateSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { orderNumber } = params
	const order = await getOrderByOrderNumber(orderNumber)

	invariantResponse(order, 'Order not found', { status: 404 })

	const { status, trackingNumber } = submission.value

	await updateOrderStatus(order.id, status, request, trackingNumber || null)

	await auditLog(userId, 'UPDATE', 'Order', order.id, {
		status: { before: order.status, after: status },
		...(trackingNumber ? { trackingNumber: { after: trackingNumber } } : {}),
		orderNumber: order.orderNumber,
	}, request)

	const statusLabel = getOrderStatusLabel(status)
	const description = trackingNumber
		? `Order status updated to ${statusLabel} (Tracking: ${trackingNumber})`
		: `Order status updated to ${statusLabel}`

	return redirectWithToast(`/admin/orders/${orderNumber}`, {
		type: 'success',
		title: 'Order Updated',
		description,
	})
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.order) {
		return [{ title: 'Order Not Found | Admin | Epic Shop' }]
	}
	return [
		{
			title: `Order ${loaderData.order.orderNumber} | Admin | Epic Shop`,
		},
		{ name: 'description', content: `View and manage order: ${loaderData.order.orderNumber}` },
	]
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$orderNumber.lazy')
