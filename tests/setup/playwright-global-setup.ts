import 'dotenv/config'
import '#app/utils/env.server.ts'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Global setup for Playwright tests
 * Ensures currency and settings exist in the database
 * This is critical because getStoreCurrency() is called in many routes
 */
async function globalSetup() {
	// Clean up stale email fixtures from previous runs
	const emailFixturesDir = path.join(__dirname, '..', 'fixtures', 'email')
	if (fs.existsSync(emailFixturesDir)) {
		for (const file of fs.readdirSync(emailFixturesDir)) {
			if (file.endsWith('.json')) {
				fs.unlinkSync(path.join(emailFixturesDir, file))
			}
		}
	}

	// Import prisma after environment is set up
	const { prisma } = await import('#app/utils/db.server.ts')
	
	// Create USD currency if it doesn't exist
	const usdCurrency = await prisma.currency.upsert({
		where: { code: 'USD' },
		create: {
			code: 'USD',
			name: 'US Dollar',
			symbol: '$',
			decimals: 2,
		},
		update: {},
	})

	// Create Settings with USD as default currency
	await prisma.settings.upsert({
		where: { id: 'settings' },
		create: {
			id: 'settings',
			currencyId: usdCurrency.id,
		},
		update: {},
	})
}

export default globalSetup
