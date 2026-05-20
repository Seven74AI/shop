import { prisma } from './db.server.ts'
import { type ReturnStatus } from './return-status.ts'

/**
 * Update a return request's status and optionally set admin notes.
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
