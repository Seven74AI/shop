import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['./app/utils/seo-meta.server.test.ts'],
		globalSetup: [],
		setupFiles: [],
	},
})
