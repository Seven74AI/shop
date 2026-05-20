/**
 * Abandoned Cart Detection & Recovery Cron Script
 *
 * Finds abandoned carts — carts with items that haven't been modified
 * for 24+ hours and haven't had a recent recovery email — then sends
 * recovery emails to registered users.
 *
 * Guest carts (no userId) are logged but cannot receive emails (no email address).
 *
 * Intended to be run on a schedule (e.g., every hour via cron, systemd timer, or CI).
 *
 * Usage:
 *   pnpm tsx scripts/abandoned-cart-cron.ts
 *
 * Exit codes:
 *   0 - Success (no abandoned carts or all processed)
 *   1 - Error during detection or email sending
 */

import {
	sendAbandonedCartEmail,
} from '#app/utils/abandoned-cart-email.server.tsx'
import { findAbandonedCarts } from '#app/utils/abandoned-cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'

export interface CronResult {
	/** Number of recovery emails successfully sent */
	sent: number
	/** Number of carts skipped (guest, no email, errors) */
	skipped: number
	/** Total carts that were processed or skipped */
	total: number
}

/**
 * Runs the abandoned cart recovery job: detects abandoned carts,
 * sends recovery emails to registered users, skips guests.
 *
 * Exported for integration testing — the cron entry-point `main()`
 * wraps this and exits with the appropriate code.
 *
 * @param log - Optional logger (defaults to console.log). Inject for test capture.
 * @param logError - Optional error logger (defaults to console.error).
 * @returns CronResult with counts of sent, skipped, and total carts.
 */
export async function runAbandonedCartCron(
	log: (...args: unknown[]) => void = console.log,
	logError: (...args: unknown[]) => void = console.error,
): Promise<CronResult> {
	log('🔍 Checking for abandoned carts...')

	const carts = await findAbandonedCarts()

	if (carts.length === 0) {
		log('✅ No abandoned carts found.')
		return { sent: 0, skipped: 0, total: 0 }
	}

	log(
		`📊 Found ${carts.length} abandoned cart(s) — processing recovery emails...`,
	)

	let sent = 0
	let skipped = 0

	for (const cart of carts) {
		const userLabel = cart.userId
			? `user=${cart.userId}`
			: `session=${cart.sessionId}`
		const itemSummary = cart.items
			.map((i) => `${i.quantity}x ${i.productName}`)
			.join(', ')
		log(
			`   🛒 ${cart.id} | ${userLabel} | ` +
				`inactive since ${cart.updatedAt.toISOString()} | ` +
				`recovery #${cart.recoveryEmailCount} | ` +
				`items: ${itemSummary}`,
		)

		// Only send recovery emails to registered users (guest carts have no email)
		if (!cart.userId) {
			log(`   ⏭️  Guest cart — no email address (skipped)`)
			skipped++
			continue
		}

		try {
			const user = await prisma.user.findUnique({
				where: { id: cart.userId },
				select: { email: true, username: true, name: true },
			})

			if (!user?.email) {
				log(
					`   ⏭️  User ${cart.userId} has no email (skipped)`,
				)
				skipped++
				continue
			}

			const customerName =
				user.name ?? user.username ?? 'Valued Customer'

			const success = await sendAbandonedCartEmail(
				cart,
				user.email,
				customerName,
			)

			if (success) {
				log(`   ✉️  Recovery email sent to ${user.email}`)
				sent++
			} else {
				log(`   ⏭️  No email sent (skipped)`)
				skipped++
			}
		} catch (error) {
			logError(
				`   ❌ Failed to send recovery email for cart ${cart.id}:`,
				error instanceof Error ? error.message : error,
			)
			skipped++
		}
	}

	log(`✅ Done: ${sent} recovery email(s) sent, ${skipped} skipped`)
	return { sent, skipped, total: carts.length }
}

async function main() {
	const result = await runAbandonedCartCron()
	process.exit(result.skipped > 0 && result.sent === 0 ? 1 : 0)
}

// Only run main() when this file is executed directly (not imported for testing)
// Vitest sets VITEST env var automatically; also check for direct script execution
if (process.env.VITEST === undefined) {
	main().catch((error) => {
		console.error('❌ Abandoned cart cron failed:', error)
		process.exit(1)
	})
}
