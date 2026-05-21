import { defineConfig } from 'prisma/config'

export default defineConfig({
	datasource: {
		url: process.env.DATABASE_URL ?? 'file:./prisma/data.db',
	},
	migrations: {
		seed: 'tsx prisma/seed.ts',
	},
})
