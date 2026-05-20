/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    include: ['./app/utils/circuit-breaker.server.test.ts'],
    environment: 'node',
    restoreMocks: true,
    server: {
      deps: {
        external: [/node:.*/],
      },
    },
  },
})
