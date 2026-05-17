import { defineConfig } from 'prisma/config'

export default defineConfig({
	datasource: {
		url: process.env.DATABASE_URL ?? 'file:./prisma/data.db?connection_limit=1',
	},
})
