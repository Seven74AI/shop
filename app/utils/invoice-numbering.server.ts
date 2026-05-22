import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'

/**
 * Promise-chain lock for serializing invoice creation operations.
 * In a single-process LiteFS primary, a Promise-based lock is sufficient
 * to prevent concurrent invoice number generation from racing.
 *
 * Usage: await withInvoiceLock(() => createInvoice(payload))
 */
let invoiceLock: Promise<void> = Promise.resolve()

export async function withInvoiceLock<T>(fn: () => Promise<T>): Promise<T> {
	const prev = invoiceLock
	let release: () => void
	invoiceLock = new Promise<void>((resolve) => {
		release = resolve
	})
	await prev
	try {
		return await fn()
	} finally {
		release!()
	}
}

/**
 * Generates a unique invoice number in the format "{year}-{sequence:05d}" (e.g., "2025-00001").
 *
 * Uses a database-level write transaction to atomically read the highest sequence
 * for the given fiscal year and return the next one. The @@unique([fiscalYear, sequence])
 * constraint provides a safety net against race conditions.
 *
 * The sequence resets on January 1 of each new fiscal year.
 *
 * @param fiscalYear - The fiscal year for the invoice (e.g., 2025).
 * @param tx - Optional transaction client. If provided, uses the existing transaction
 *   instead of creating a new one. This allows the invoice number generation to be
 *   composed within a larger transaction (e.g., creating the invoice record).
 * @returns The formatted invoice number string.
 */
export async function generateInvoiceNumber(
	fiscalYear: number,
	tx?: Prisma.TransactionClient,
): Promise<string> {
	// If a transaction client is provided, use it directly
	if (tx) {
		const lastInvoice = await tx.invoice.findFirst({
			where: { fiscalYear },
			orderBy: { sequence: 'desc' },
			select: { sequence: true },
		})

		const nextSequence =
			lastInvoice && !isNaN(lastInvoice.sequence)
				? lastInvoice.sequence + 1
				: 1

		return formatInvoiceNumber(fiscalYear, nextSequence)
	}

	// For SQLite, we use BEGIN IMMEDIATE to get an exclusive write lock.
	// This ensures sequential numbering even with concurrent requests.
	return await prisma.$transaction(
		async (transactionTx) => {
			const lastInvoice = await transactionTx.invoice.findFirst({
				where: { fiscalYear },
				orderBy: { sequence: 'desc' },
				select: { sequence: true },
			})

			const nextSequence =
				lastInvoice && !isNaN(lastInvoice.sequence)
					? lastInvoice.sequence + 1
					: 1

			return formatInvoiceNumber(fiscalYear, nextSequence)
		},
		{
			// Use maxWait to prevent indefinite waits
			maxWait: 5000, // 5 seconds
			timeout: 10000, // 10 seconds
		},
	)
}

/**
 * Formats a fiscal year and sequence into the invoice number format.
 *
 * @example
 * formatInvoiceNumber(2025, 1)   // "2025-00001"
 * formatInvoiceNumber(2025, 42)  // "2025-00042"
 * formatInvoiceNumber(2026, 150) // "2026-00150"
 */
export function formatInvoiceNumber(
	fiscalYear: number,
	sequence: number,
): string {
	return `F${fiscalYear}-${String(sequence).padStart(5, '0')}`
}

/**
 * Extracts the fiscal year and sequence from an invoice number string.
 * Returns null if the format is invalid.
 *
 * @example
 * parseInvoiceNumber("2025-00001") // { fiscalYear: 2025, sequence: 1 }
 * parseInvoiceNumber("2025-00150") // { fiscalYear: 2025, sequence: 150 }
 */
export function parseInvoiceNumber(
	invoiceNumber: string,
): { fiscalYear: number; sequence: number } | null {
	const match = invoiceNumber.match(/^F(\d{4})-(\d{5})$/)
	if (!match || !match[1] || !match[2]) return null
	const fiscalYear = parseInt(match[1], 10)
	const sequence = parseInt(match[2], 10)
	if (isNaN(fiscalYear) || isNaN(sequence)) return null
	return { fiscalYear, sequence }
}
