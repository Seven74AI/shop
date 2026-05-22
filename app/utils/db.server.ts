import { styleText } from 'node:util'
import { remember } from '@epic-web/remember'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { log } from '#app/utils/logging.server.ts'

export const prisma = remember('prisma', () => {
	const logThreshold = 20

	const adapter = new PrismaBetterSqlite3({
		url: process.env.DATABASE_URL ?? 'file:./prisma/data.db',
	})

	const client = new PrismaClient({
		adapter,
		log: [
			{ level: 'query', emit: 'event' },
			{ level: 'error', emit: 'stdout' },
			{ level: 'warn', emit: 'stdout' },
		],
	})
	client.$on('query', async (e) => {
		if (e.duration < logThreshold) return
		const color =
			e.duration < logThreshold * 1.1
				? 'green'
				: e.duration < logThreshold * 1.2
					? 'blue'
					: e.duration < logThreshold * 1.3
						? 'yellow'
						: e.duration < logThreshold * 1.4
							? 'redBright'
							: 'red'
		const dur = styleText(color, `${e.duration}ms`)
		log.info({ duration: e.duration, query: e.query }, `prisma:query - ${dur} - ${e.query}`)
	})
	void client.$connect()
	return client
})
