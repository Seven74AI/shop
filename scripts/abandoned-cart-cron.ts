/**
 * Abandoned Cart Recovery Cron Script
 *
 * Finds abandoned carts and sends recovery emails.
 * Intended to be run on a schedule (e.g., every hour via cron, systemd timer, or CI).
 *
 * Usage:
 *   pnpm tsx scripts/abandoned-cart-cron.ts
 *
 * Environment:
 *   - SESSION_SECRET: required for recovery token signing
 *   - RESEND_API_KEY: optional, emails are mocked if not set
 *   - MOCKS: set to 'true' to mock email sending
 *   - HOST_URL: base URL for recovery links (default: https://shop.example)
 *
 * Exit codes:
 *   0 - Success (no abandoned carts or all emails sent)
 *   1 - Some emails failed to send
 */

import { processAbandonedCarts } from '#app/utils/abandoned-cart.server.ts'

async function main() {
	console.log('🔍 Checking for abandoned carts...')

	const result = await processAbandonedCarts()

	if (result.total === 0) {
		console.log('✅ No abandoned carts found.')
		process.exit(0)
	}

	console.log(`📊 Found ${result.total} abandoned cart(s)`)
	console.log(`   ✅ Sent: ${result.sent}`)
	if (result.failed > 0) {
		console.error(`   ❌ Failed: ${result.failed}`)
	}

	process.exit(result.failed > 0 ? 1 : 0)
}

main().catch((error) => {
	console.error('❌ Abandoned cart cron failed:', error)
	process.exit(1)
})
