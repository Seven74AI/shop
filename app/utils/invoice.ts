/**
 * Invoice number formatting utilities.
 *
 * These are pure string functions with zero server dependencies — safe to import
 * from client-side JSX components.
 */

/**
 * Formats a fiscal year and sequence into the invoice number format.
 *
 * @example
 * formatInvoiceNumber(2025, 1)   // "F2025-00001"
 * formatInvoiceNumber(2025, 42)  // "F2025-00042"
 * formatInvoiceNumber(2026, 150) // "F2026-00150"
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
 * parseInvoiceNumber("F2025-00001") // { fiscalYear: 2025, sequence: 1 }
 * parseInvoiceNumber("F2025-00150") // { fiscalYear: 2025, sequence: 150 }
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
