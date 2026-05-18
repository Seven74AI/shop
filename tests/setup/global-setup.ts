import path from 'node:path'
import { execaCommand } from 'execa'
import fsExtra from 'fs-extra'
import 'dotenv/config'
import '#app/utils/env.server.ts'
import '#app/utils/cache.server.ts'

export const BASE_DATABASE_PATH = path.join(
	process.cwd(),
	`./tests/prisma/base.db`,
)

export async function setup() {
	const databaseExists = await fsExtra.pathExists(BASE_DATABASE_PATH)
	let needsReset = false

	if (databaseExists) {
		const databaseLastModifiedAt = (await fsExtra.stat(BASE_DATABASE_PATH))
			.mtime
		const prismaSchemaLastModifiedAt = (
			await fsExtra.stat('./prisma/schema.prisma')
		).mtime

		if (prismaSchemaLastModifiedAt >= databaseLastModifiedAt) {
			needsReset = true
		}
	} else {
		needsReset = true
	}

	if (needsReset) {
		await execaCommand(
			'pnpm exec prisma migrate reset --force',
			{
				stdio: 'inherit',
				env: {
					...process.env,
					DATABASE_URL: `file:${BASE_DATABASE_PATH}`,
				},
			},
		)
	}

	// ALWAYS ensure currency and settings exist for tests (required by getStoreCurrency)
	process.env.DATABASE_URL = `file:${BASE_DATABASE_PATH}`
	const { prisma } = await import('#app/utils/db.server.ts')
	
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

	await prisma.settings.upsert({
		where: { id: 'settings' },
		create: {
			id: 'settings',
			currencyId: usdCurrency.id,
		},
		update: {},
	})
}
