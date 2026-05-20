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

import { sendAbandonedCartEmail } from '#app/utils/abandoned-cart-email.server.tsx'
import { findAbandonedCarts } from '#app/utils/abandoned-cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'

async function main() {
	console.log('🔍 Checking for abandoned carts...')

	const carts = await findAbandonedCarts()

	if (carts.length === 0) {
		console.log('✅ No abandoned carts found.')
		process.exit(0)
	}

	console.log(
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
		console.log(
			`   🛒 ${cart.id} | ${userLabel} | ` +
				`inactive since ${cart.updatedAt.toISOString()} | ` +
				`recovery #${cart.recoveryEmailCount} | ` +
				`items: ${itemSummary}`,
		)

		// Only send recovery emails to registered users (guest carts have no email)
		if (!cart.userId) {
			console.log(
				`   ⏭️  Guest cart — no email address (skipped)`,
			)
			skipped++
			continue
		}

		try {
			const user = await prisma.user.findUnique({
				where: { id: cart.userId },
				select: { email: true, username: true, name: true },
			})

			if (!user?.email) {
				console.log(
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
				console.log(
					`   ✉️  Recovery email sent to ${user.email}`,
				)
				sent++
			} else {
				console.log(`   ⏭️  No email sent (skipped)`)
				skipped++
			}
		} catch (error) {
			console.error(
				`   ❌ Failed to send recovery email for cart ${cart.id}:`,
				error instanceof Error ? error.message : error,
			)
			skipped++
		}
	}

	console.log(
		`✅ Done: ${sent} recovery email(s) sent, ${skipped} skipped`,
	)
	process.exit(0)
}

main().catch((error) => {
	console.error('❌ Abandoned cart cron failed:', error)
	process.exit(1)
})
