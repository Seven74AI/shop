import 'dotenv/config'
import '#app/utils/env.server.ts'
import { execaCommand } from 'execa'

/**
 * Global setup for Playwright tests
 * Ensures migrations are applied and currency/settings exist
 */
async function globalSetup() {
	// Run migrations on the play test database
	try {
		await execaCommand('npx prisma migrate deploy', {
			stdio: 'inherit',
			env: {
				...process.env,
				DATABASE_URL: 'file:./tests/prisma/play.db',
			},
		})
	} catch (e) {
		console.warn('Migration may have already been applied, continuing...')
	}

	// Import prisma after DATABASE_URL is set
	process.env.DATABASE_URL = 'file:./tests/prisma/play.db'
	
	// Ensure prisma client is generated
	await execaCommand('npx prisma generate --sql', {
		stdio: 'inherit',
		env: { ...process.env },
	})

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
