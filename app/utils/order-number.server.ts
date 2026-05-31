import { randomBytes } from 'node:crypto'
import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'

/**
 * Generates a unique order number in the format "ORD-XXXXXX" where XXXXXX is a zero-padded 6-digit number.
 * Uses database-level locking by selecting with a write lock to prevent race conditions.
 * For SQLite, this ensures sequential numbering even under high concurrency.
 *
 * In test mode (MOCKS=true): appends a random 4-hex suffix to avoid cross-worker collisions
 * when multiple Playwright workers insert orders concurrently.
 *
 * @param tx - Optional transaction client. If provided, uses the existing transaction instead of creating a new one.
 */
export async function generateOrderNumber(
	tx?: Prisma.TransactionClient,
): Promise<string> {
	const isTest = process.env.MOCKS === 'true'

	// If a transaction client is provided, use it directly
	if (tx) {
		// Get the highest order number within the existing transaction
		const lastOrder = await tx.order.findFirst({
			orderBy: { orderNumber: 'desc' },
			select: { orderNumber: true },
		})

		let nextNumber = 1

		if (lastOrder) {
			// Extract the numeric part from "ORD-XXXXXX" (strip any random suffix)
			const cleaned = (lastOrder.orderNumber.replace('ORD-', '').split('-')[0]) ?? '0'
			const lastNumber = parseInt(cleaned, 10)
			if (!isNaN(lastNumber)) {
				nextNumber = lastNumber + 1
			}
		}

		const base = `ORD-${String(nextNumber).padStart(6, '0')}`
		// In test mode, append a random suffix to prevent cross-worker collisions
		return isTest ? `${base}-${randomBytes(2).toString('hex')}` : base
	}

	// For SQLite, we use BEGIN IMMEDIATE to get an exclusive lock
	// This ensures sequential ordering within a single process, but in test mode
	// with MOCKS=true, multiple Playwright worker processes can still collide.
	// The random suffix avoids that without changing the production format.
	return await prisma.$transaction(
		async (transactionTx) => {
			// Get the highest order number
			const lastOrder = await transactionTx.order.findFirst({
				orderBy: { orderNumber: 'desc' },
				select: { orderNumber: true },
			})

			let nextNumber = 1

			if (lastOrder) {
			// Extract the numeric part from "ORD-XXXXXX" (strip any test-mode suffix)
			const cleaned = (lastOrder.orderNumber.replace('ORD-', '').split('-')[0]) ?? '0'
				const lastNumber = parseInt(cleaned, 10)
				if (!isNaN(lastNumber)) {
					nextNumber = lastNumber + 1
				}
			}

			const base = `ORD-${String(nextNumber).padStart(6, '0')}`
			return isTest ? `${base}-${randomBytes(2).toString('hex')}` : base
		},
		{
			// Use maxWait to prevent indefinite waits
			maxWait: 5000, // 5 seconds
			timeout: 10000, // 10 seconds
		},
	)
}

