import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { type ReturnStatus } from './return-status.ts'

/**
 * Allowed status transitions for return requests.
 * REFUNDED and REJECTED are terminal states with no further transitions.
 */
const ALLOWED_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
	REQUESTED: ['APPROVED', 'REJECTED'],
	APPROVED: ['SHIPPED', 'RECEIVED', 'REJECTED'],
	SHIPPED: ['RECEIVED', 'REJECTED'],
	RECEIVED: ['REFUNDED', 'REJECTED'],
	REFUNDED: [],
	REJECTED: [],
}

const STATUS_EMAIL_SUBJECTS: Record<ReturnStatus, string> = {
	REQUESTED: 'Return Request Received',
	APPROVED: 'Return Request Approved',
	SHIPPED: 'Return Shipment Confirmed',
	RECEIVED: 'Return Received — Refund Pending',
	REFUNDED: 'Return Refund Processed',
	REJECTED: 'Return Request Update',
}

const STATUS_EMAIL_BODIES: Record<ReturnStatus, string> = {
	REQUESTED:
		'Your return request has been received and is pending review.',
	APPROVED:
		'Your return request has been approved. Please ship the item(s) back to us.',
	SHIPPED:
		'Your return shipment has been confirmed. We will process your return once the items are received.',
	RECEIVED:
		'We have received your returned item(s). Your refund will be processed shortly.',
	REFUNDED:
		'Your refund has been processed. The amount should appear in your account within 5-10 business days.',
	REJECTED:
		'Your return request has been reviewed. Please check the notes below for details.',
}

/**
 * Update a return request's status and optionally set admin notes.
 * Enforces valid status transitions — a 400 is thrown for invalid ones.
 * Automatically sets timestamps:
 * - APPROVED → no timestamp change
 * - RECEIVED → sets receivedAt
 * - REFUNDED → sets refundedAt
 * Sends email notification to the customer on status change.
 */
export async function updateReturnStatus(
	returnId: string,
	status: ReturnStatus,
	adminNotes?: string | null,
	refundAmountCents?: number | null,
	restockingFeeCents?: number | null,
) {
	// Validate the status transition before applying
	const current = await prisma.returnRequest.findUnique({
		where: { id: returnId },
		select: {
			status: true,
			order: { select: { email: true } },
		},
	})

	if (!current) {
		throw new Response('Return request not found', { status: 404 })
	}

	const currentStatus = current.status as ReturnStatus
	const allowed = ALLOWED_TRANSITIONS[currentStatus]
	if (!allowed || !allowed.includes(status)) {
		throw new Response(
			`Invalid status transition: ${current.status} → ${status}`,
			{ status: 400 },
		)
	}

	const data: Record<string, unknown> = { status }

	if (adminNotes !== undefined) {
		data.adminNotes = adminNotes
	}

	if (status === 'RECEIVED') {
		data.receivedAt = new Date()
	}

	if (status === 'REFUNDED') {
		data.refundedAt = new Date()
		if (refundAmountCents !== undefined && refundAmountCents !== null) {
			data.refundAmountCents = refundAmountCents
		}
		if (restockingFeeCents !== undefined && restockingFeeCents !== null) {
			data.restockingFeeCents = restockingFeeCents
		}
	}

	const updated = await prisma.returnRequest.update({
		where: { id: returnId },
		data,
	})

	// Send email notification to customer
	const customerEmail = current.order.email
	if (customerEmail) {
		const subject = STATUS_EMAIL_SUBJECTS[status]
		const body = STATUS_EMAIL_BODIES[status]
		try {
			await sendEmail({
				to: customerEmail,
				subject,
				html: `<p>${body}</p>`,
				text: body,
			})
		} catch {
			// Email failures should not block the status update
			console.error(
				`Failed to send return status email to ${customerEmail} for return ${returnId}`,
			)
		}
	}

	return updated
}

/**
 * Add or update admin notes on a return request without changing status.
 */
export async function updateReturnAdminNotes(
	returnId: string,
	adminNotes: string,
) {
	return prisma.returnRequest.update({
		where: { id: returnId },
		data: { adminNotes },
	})
}
