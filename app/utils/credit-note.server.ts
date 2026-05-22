import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'
import {
	generateInvoiceNumber,
	parseInvoiceNumber,
	issueCreditNote,
	type RefundedLineItem,
} from './invoice.server.ts'
import {
	generateInvoicePdf,
	type InvoicePdfData,
} from './invoice-pdf.server.tsx'

/**
 * Generates a credit note number in the format "CN-YYYY-NNNNN" (e.g., "CN-2025-00001").
 *
 * Credit notes share the same gapless sequence as invoices (French CGI art. L. 102 B)
 * but are displayed with a CN- prefix to distinguish them from standard invoices.
 * This function delegates to `generateInvoiceNumber()` which uses the shared
 * gapless counter — all invoices and credit notes draw from one sequence.
 *
 * @param fiscalYear - The fiscal year for the credit note.
 * @param tx - Optional transaction client.
 * @returns The formatted credit note number string.
 */
export async function generateCreditNoteNumber(
	fiscalYear: number,
	tx?: Prisma.TransactionClient,
): Promise<string> {
	// eslint-disable-next-line @typescript-eslint/no-shadow
	const { generateInvoiceNumber: genInvoiceNum } = await import('./invoice.server.ts')
	const invoiceNumber = await genInvoiceNum(fiscalYear, tx)
	const parsed = parseInvoiceNumber(invoiceNumber)
	if (!parsed) {
		throw new Error(
			`Failed to parse generated invoice number: ${invoiceNumber}`,
		)
	}
	return formatCreditNoteNumber(parsed.fiscalYear, parsed.sequence)
}

/**
 * Formats a fiscal year and sequence into the credit note number format.
 *
 * @example
 * formatCreditNoteNumber(2025, 1)   // "CN-2025-00001"
 * formatCreditNoteNumber(2025, 42)  // "CN-2025-00042"
 */
export function formatCreditNoteNumber(
	fiscalYear: number,
	sequence: number,
): string {
	return `CN-${fiscalYear}-${String(sequence).padStart(5, '0')}`
}

/**
 * Parses a credit note number string into its fiscal year and sequence.
 * Returns null if the format is invalid.
 *
 * @example
 * parseCreditNoteNumber("CN-2025-00001") // { fiscalYear: 2025, sequence: 1 }
 */
export function parseCreditNoteNumber(
	number: string,
): { fiscalYear: number; sequence: number } | null {
	const match = number.match(/^CN-(\d{4})-(\d{5})$/)
	if (!match || !match[1] || !match[2]) return null
	const fiscalYear = parseInt(match[1], 10)
	const sequence = parseInt(match[2], 10)
	if (isNaN(fiscalYear) || isNaN(sequence)) return null
	return { fiscalYear, sequence }
}

export interface CreateCreditNoteItem {
	description: string
	quantity: number
	unitPriceCents: number
	totalCents: number
}

export interface CreateCreditNoteResult {
	id: string
	number: string
	fiscalYear: number
	sequence: number
	isPartial: boolean
}

/**
 * Creates a credit note for a partial or full refund, linked to an existing invoice.
 *
 * This is the main entry point for the credit note flow. It handles:
 * - Detecting partial vs full refund (by comparing refunded line items against
 *   the order's total items)
 * - Generating a CN-YYYY-NNNNN credit note number
 * - Storing the reason for the credit note
 * - Updating the parent invoice status (PARTIALLY_REFUNDED or REFUNDED)
 * - Optionally generating a PDF (via the invoice PDF pipeline)
 *
 * @param invoiceId - The ID of the parent invoice being corrected.
 * @param refundAmount - The total refund amount in cents (informational).
 * @param reason - The reason for the credit note (e.g., "return", "damaged").
 * @param items - The line items being refunded (with positive amounts;
 *   they are negated during creation).
 * @param refundedShippingCents - Optional shipping cost being refunded (positive; negated). Defaults to 0.
 * @param tx - Optional transaction client for composing within a larger transaction.
 * @returns The created credit note details.
 */
export async function createCreditNote(
	invoiceId: string,
	refundAmount: number,
	reason: string,
	items: CreateCreditNoteItem[],
	refundedShippingCents: number = 0,
	tx?: Prisma.TransactionClient,
): Promise<CreateCreditNoteResult> {
	const db = tx ?? prisma

	// Fetch parent invoice and its order to determine partial vs full
	const parent = await db.invoice.findUnique({
		where: { id: invoiceId },
		select: {
			id: true,
			orderId: true,
			order: {
				select: {
					items: { select: { id: true, quantity: true } },
					shippingCost: true,
				},
			},
		},
	})

	if (!parent) {
		throw new Error(`Parent invoice ${invoiceId} not found`)
	}

	// Convert CreateCreditNoteItem[] to RefundedLineItem[] for issueCreditNote
	const refundedItems: RefundedLineItem[] = items.map((item) => ({
		description: item.description,
		quantity: item.quantity,
		unitPriceCents: item.unitPriceCents,
		totalCents: item.totalCents,
	}))

	// Determine if this is partial or full:
	// Compare the total quantity of refunded items against order's total items.
	// A full refund = every order item is fully refunded.
	const totalOrderItems = parent.order.items.reduce(
		(sum, oi) => sum + oi.quantity,
		0,
	)
	const totalRefundedItems = items.reduce(
		(sum, item) => sum + item.quantity,
		0,
	)
	const isPartial = totalRefundedItems < totalOrderItems

	// Issue the credit note via the existing shared logic
	const result = await issueCreditNote(
		invoiceId,
		refundedItems,
		refundedShippingCents,
		tx,
	)

	// Store the reason on the credit note
	await db.invoice.update({
		where: { id: result.id },
		data: { reason },
	})

	// Update parent invoice status based on partial vs full
	const newStatus = isPartial ? 'PARTIALLY_REFUNDED' : 'REFUNDED'
	await db.invoice.update({
		where: { id: invoiceId },
		data: { status: newStatus },
	})

	return {
		id: result.id,
		// Transform F{year}-{sequence} → CN-{year}-{sequence}
		number: `CN-${result.fiscalYear}-${String(result.sequence).padStart(5, '0')}`,
		fiscalYear: result.fiscalYear,
		sequence: result.sequence,
		isPartial,
	}
}

/**
 * Generates a PDF for a credit note using the invoice PDF pipeline.
 *
 * @param creditNoteId - The ID of the credit note invoice record.
 * @param orderNumber - The human-readable order number (e.g., "ORD-001234").
 * @param orderDate - The order date for display.
 * @param shippingInfo - Customer shipping info.
 * @param tx - Optional transaction client.
 * @returns A Buffer containing the PDF.
 */
export async function generateCreditNotePdf(
	creditNoteId: string,
	orderNumber: string,
	orderDate: Date,
	shippingInfo: {
		name: string
		email: string
		street: string
		city: string
		postal: string
		country: string
	},
	tx?: Prisma.TransactionClient,
): Promise<Buffer> {
	const db = tx ?? prisma

	const creditNote = await db.invoice.findUnique({
		where: { id: creditNoteId },
		select: {
			id: true,
			fiscalYear: true,
			sequence: true,
			subtotalCents: true,
			totalCents: true,
			vatBreakdown: true,
			vatTotalCents: true,
			status: true,
			parentInvoice: {
				select: { fiscalYear: true, sequence: true },
			},
		},
	})

	if (!creditNote) {
		throw new Error(`Credit note ${creditNoteId} not found`)
	}

	const cnNumber = formatCreditNoteNumber(
		creditNote.fiscalYear,
		creditNote.sequence,
	)

	const parentInvoiceNumber = creditNote.parentInvoice
		? `F${creditNote.parentInvoice.fiscalYear}-${String(creditNote.parentInvoice.sequence).padStart(5, '0')}`
		: undefined

	const pdfData: InvoicePdfData = {
		kind: 'CREDIT_NOTE',
		invoiceNumber: cnNumber,
		parentInvoiceNumber,
		invoiceDate: new Date().toLocaleDateString('fr-FR'),
		invoiceStatus: creditNote.status,
		orderNumber,
		orderDate: orderDate.toLocaleDateString('fr-FR'),
		customer: {
			name: shippingInfo.name,
			email: shippingInfo.email,
			company: null,
			vatNumber: null,
		},
		shipping: {
			name: shippingInfo.name,
			street: shippingInfo.street,
			city: shippingInfo.city,
			postal: shippingInfo.postal,
			country: shippingInfo.country,
		},
		items: [], // Populated by the caller if needed
		subtotalCents: creditNote.subtotalCents,
		vatBreakdown: [],
		vatTotalCents: creditNote.vatTotalCents,
		shippingCostCents: 0,
		totalCents: creditNote.totalCents,
		currency: { symbol: '€', code: 'EUR', decimals: 2 },
		storeName: 'Epic Shop',
		storeAddress: '123 Epic Street, 75001 Paris, France',
		storeVatNumber: 'FR12345678901',
		storeEmail: 'support@epicstack.dev',
	}

	return generateInvoicePdf(pdfData)
}
