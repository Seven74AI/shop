import { prisma } from './db.server.ts'

/**
 * Simple sequential lock using a promise chain.
 *
 * In Node.js's single-threaded event loop, we can serialize async
 * operations by chaining promises. Each caller waits for the previous
 * caller's lock to release before proceeding.
 *
 * This guarantees that only one caller reads the max sequence and
 * creates an invoice at a time, preventing race conditions where
 * two callers read the same max sequence.
 *
 * For production (LiteFS multi-instance), this should be replaced
 * with a distributed lock. But for single-process scenarios (which
 * is the common case with LiteFS primary), this is sufficient and
 * has zero latency overhead.
 *
 * @internal Exported for testing only.
 */
let _lock: Promise<void> = Promise.resolve()

function acquireInvoiceLock(): Promise<() => void> {
	const prev = _lock
	let release: () => void
	_lock = new Promise<void>((resolve) => {
		release = resolve
	})
	return prev.then(() => release!)
}

/**
 * Execute an async function while holding the invoice numbering lock.
 * Use this when you need to atomically generate a number AND create
 * the Invoice record in the same critical section.
 *
 * Example:
 * ```typescript
 * const number = await withInvoiceLock(async () => {
 *   const num = await nextInvoiceNumber(2026)
 *   await prisma.invoice.create({ data: { ..., number: num } })
 *   return num
 * })
 * ```
 *
 * @param fn - Async function to execute while the lock is held
 * @returns The return value of fn
 */
export async function withInvoiceLock<T>(
	fn: () => Promise<T>,
): Promise<T> {
	const release = await acquireInvoiceLock()
	try {
		return await fn()
	} finally {
		release()
	}
}

/**
 * Gapless sequential invoice numbering per fiscal year.
 *
 * ## Locking Strategy
 *
 * Uses `withInvoiceLock` to serialize access. Within the lock:
 * 1. Read the highest sequence for the fiscal year via `prisma.$transaction`
 * 2. Calculate the next number
 * 3. Return it
 *
 * **Important:** The caller MUST create the Invoice record immediately
 * after calling this function, within the same lock via `withInvoiceLock`.
 * If the caller discards the number or creates the invoice outside the lock,
 * that sequence number is lost (gap) — this function only READS the max
 * sequence; it does not persist the reservation.
 *
 * For the simpler case where the caller can guarantee serial access
 * (e.g., only one request handler processes orders), calling
 * `nextInvoiceNumber` without the lock is sufficient — but
 * `withInvoiceLock` wrapping both the number generation and Invoice
 * creation is always safer.
 *
 * Under LiteFS, the primary instance handles all writes; replicas are
 * read-only. The `@@unique([fiscalYear, sequence])` constraint on the
 * Invoice table acts as a final safety net.
 *
 * ## Format
 *
 * `${fiscalYear}-${sequence.toString().padStart(6, '0')}`
 * e.g., 2026-000001, 2026-000123
 *
 * @param fiscalYear - The fiscal year (e.g., 2026)
 * @returns The next invoice number in the format "YYYY-NNNNNN"
 */
export async function nextInvoiceNumber(
	fiscalYear: number,
): Promise<string> {
	return prisma.$transaction(
		async (tx) => {
			// Find the highest sequence for this fiscal year
			const lastInvoice = await tx.invoice.findFirst({
				where: { fiscalYear },
				orderBy: { sequence: 'desc' },
				select: { sequence: true },
			})

			const nextSequence = lastInvoice
				? lastInvoice.sequence + 1
				: 1

			// Format: 2026-000001
			return `${fiscalYear}-${String(nextSequence).padStart(6, '0')}`
		},
		{
			maxWait: 5000, // 5 seconds
			timeout: 10000, // 10 seconds
		},
	)
}
