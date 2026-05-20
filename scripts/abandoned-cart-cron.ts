/**
 * Abandoned Cart Detection Cron Script
 *
 * Finds abandoned carts — carts with items that haven't been modified
 * for 24+ hours and haven't had a recent recovery email.
 *
 * This is Part 1/3: detection only. The email-sending logic (Part 2)
 * will build on this by calling `findAbandonedCarts` and sending
 * recovery emails via `sendAbandonedCartEmail`.
 *
 * Intended to be run on a schedule (e.g., every hour via cron, systemd timer, or CI).
 *
 * Usage:
 *   pnpm tsx scripts/abandoned-cart-cron.ts
 *
 * Exit codes:
 *   0 - Success (no abandoned carts or all detections logged)
 *   1 - Error during detection
 */

import { findAbandonedCarts } from '#app/utils/abandoned-cart.server.ts'

async function main() {
	console.log('🔍 Checking for abandoned carts...')

	const carts = await findAbandonedCarts()

	if (carts.length === 0) {
		console.log('✅ No abandoned carts found.')
		process.exit(0)
	}

	console.log(`📊 Found ${carts.length} abandoned cart(s):`)
	for (const cart of carts) {
		const userLabel = cart.userId ? `user=${cart.userId}` : `session=${cart.sessionId}`
		const itemSummary = cart.items
			.map((i) => `${i.quantity}x ${i.productName}`)
			.join(', ')
		console.log(
			`   🛒 ${cart.id} | ${userLabel} | ` +
				`inactive since ${cart.updatedAt.toISOString()} | ` +
				`recovery #${cart.recoveryEmailCount} | ` +
				`items: ${itemSummary}`,
		)
	}

	process.exit(0)
}

main().catch((error) => {
	console.error('❌ Abandoned cart detection failed:', error)
	process.exit(1)
})
