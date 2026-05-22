import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import {
	generateInvoiceNumber,
	formatInvoiceNumber,
	parseInvoiceNumber,
	withInvoiceLock,
} from './invoice-numbering.server.ts'

// Re-export the numbering functions for backward compatibility
export {
	generateInvoiceNumber,
	formatInvoiceNumber,
	parseInvoiceNumber,
	withInvoiceLock,
}

// ---------------------------------------------------------------------------
// Credit note helpers
// ---------------------------------------------------------------------------

export interface RefundedLineItem {
	description: string
	quantity: number
	unitPriceCents: number
	totalCents: number
}

export interface VatBreakdownEntry {
	kind: string
	rate: number
	baseCents: number
	vatCents: number
}

/**
 * Issues a credit note (avoir) for a full order refund.
 *
 * Credit notes share the same gapless invoice number sequence per French
 * tax law (CGI art. L. 102 B) — no separate counter. Amounts are stored as
 * negative values: positive cents become negative to represent the reversal.
 *
 * @param parentInvoiceId - The original INVOICE being corrected.
 * @param refundedItems - The line items being refunded (with positive amounts;
 *   they are negated during creation).
 * @param refundedShippingCents - Shipping cost being refunded (positive; negated).
 * @param tx - Optional transaction client for composing within a larger
 *   transaction (e.g., alongside the order status update).
 * @returns The newly created credit note Invoice record.
 */
export async function issueCreditNote(
	parentInvoiceId: string,
	refundedItems: RefundedLineItem[],
	refundedShippingCents: number,
	tx?: Prisma.TransactionClient,
) {
	const db = tx ?? prisma

	// Fetch parent invoice to get orderId and original VAT breakdown
	const parent = await db.invoice.findUnique({
		where: { id: parentInvoiceId },
		select: {
			id: true,
			orderId: true,
			fiscalYear: true,
			vatBreakdown: true,
			vatTotalCents: true,
			status: true,
		},
	})

	if (!parent) {
		throw new Error(`Parent invoice ${parentInvoiceId} not found`)
	}

	// Build negative line items — negate the positive amounts into reversals
	const negativeItems = refundedItems.map((item) => ({
		description: item.description,
		quantity: -item.quantity,
		unitPriceCents: item.unitPriceCents, // unit price stays positive for display
		totalCents: -item.totalCents,
	}))

	// Compute subtotal (sum of all negative line item totals)
	const subtotalCents = negativeItems.reduce(
		(sum, item) => sum + item.totalCents,
		0,
	)

	// Negate shipping
	const shippingCents = -refundedShippingCents

	// Build negative VAT breakdown — mirror the original but negate amounts
	const vatBreakdown = parent.vatBreakdown as VatBreakdownEntry[] | null
	const creditNoteVatBreakdown: VatBreakdownEntry[] = []
	let vatTotalCents = 0

	if (Array.isArray(vatBreakdown) && vatBreakdown.length > 0) {
		for (const entry of vatBreakdown) {
			creditNoteVatBreakdown.push({
				kind: entry.kind,
				rate: entry.rate,
				baseCents: -Math.abs(entry.baseCents),
				vatCents: -Math.abs(entry.vatCents),
			})
			vatTotalCents += -Math.abs(entry.vatCents)
		}
	}

	// Total = subtotal + shipping + VAT
	const totalCents = subtotalCents + shippingCents + vatTotalCents

	// Generate next invoice number (shared sequence)
	const fiscalYear = new Date().getFullYear()
	const invoiceNumber = await generateInvoiceNumber(fiscalYear, tx)
	const parsed = parseInvoiceNumber(invoiceNumber)
	if (!parsed) {
		throw new Error(
			`Failed to parse generated invoice number: ${invoiceNumber}`,
		)
	}

	// Create the credit note
	const creditNote = await db.invoice.create({
		data: {
			fiscalYear,
			sequence: parsed.sequence,
			kind: 'CREDIT_NOTE',
			orderId: parent.orderId,
			parentInvoiceId,
			subtotalCents,
			totalCents,
			vatBreakdown: creditNoteVatBreakdown as any,
			vatTotalCents,
			status: 'FINAL',
			issuedAt: new Date(),
		},
	})

	return {
		id: creditNote.id,
		number: invoiceNumber,
		fiscalYear,
		sequence: parsed.sequence,
	}
}
