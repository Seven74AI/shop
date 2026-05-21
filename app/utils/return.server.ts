import { prisma } from './db.server.ts'
import { type ReturnStatus } from './return-status.ts'

/**
 * Allowed status transitions for return requests.
 * REFUNDED and REJECTED are terminal states with no further transitions.
 */
const ALLOWED_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
	REQUESTED: ['APPROVED', 'REJECTED'],
	APPROVED: ['RECEIVED', 'REJECTED'],
	RECEIVED: ['REFUNDED', 'REJECTED'],
	REFUNDED: [],
	REJECTED: [],
}

/**
 * Update a return request's status and optionally set admin notes.
 * Enforces valid status transitions — a 400 is thrown for invalid ones.
 * Automatically sets timestamps:
 * - APPROVED → no timestamp change
 * - RECEIVED → sets receivedAt
 * - REFUNDED → sets refundedAt
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
		select: { status: true },
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

	return prisma.returnRequest.update({
		where: { id: returnId },
		data,
	})
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