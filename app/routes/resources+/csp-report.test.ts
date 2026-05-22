/**
 * @vitest-environment node
 *
 * CSP report endpoint tests — verifies violation reports are accepted,
 * malformed payloads are handled gracefully, and non-POST methods are rejected.
 */
import { describe, expect, test, vi } from 'vitest'
import { action, loader } from './csp-report.tsx'

// Import the mocked console spies from setup
import { consoleError, consoleWarn } from '#tests/setup/setup-test-env.ts'

// ─── Valid POST submissions ──────────────────────────────────────────

describe('csp-report action', () => {
	describe('valid CSP reports', () => {
		test('returns 204 for valid csp-report payload', async () => {
			// Action triggers console.warn when csp-report key is present
			consoleWarn.mockImplementation(() => {})
			consoleError.mockImplementation(() => {})

			const body = JSON.stringify({
				'csp-report': {
					'document-uri': 'https://shop.example.com/',
					'referrer': '',
					'violated-directive': 'script-src',
					'effective-directive': 'script-src',
					'blocked-uri': 'https://evil.example.com/xss.js',
					'line-number': 42,
					'source-file': 'https://shop.example.com/app.js',
					'script-sample': "eval('bad')",
				},
			})

			const request = new Request(
				'http://localhost:3000/resources/csp-report',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/csp-report',
					},
					body,
				},
			)

			const response = await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/csp-report',
				),
				pattern: '',
			}) as Response

			expect(response.status).toBe(204)
			const responseBody = await response.text()
			expect(responseBody).toBe('')

			consoleWarn.mockRestore()
			consoleError.mockRestore()
		})

		test('returns 204 for empty body', async () => {
			const request = new Request(
				'http://localhost:3000/resources/csp-report',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/csp-report',
					},
				},
			)

			const response = await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/csp-report',
				),
				pattern: '',
			}) as Response

			expect(response.status).toBe(204)
		})

		test('returns 204 for malformed JSON body', async () => {
			// Malformed JSON triggers console.error in the catch block
			consoleError.mockImplementation(() => {})
			consoleWarn.mockImplementation(() => {})

			const request = new Request(
				'http://localhost:3000/resources/csp-report',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/csp-report',
					},
					body: 'not valid json {{{',
				},
			)

			const response = await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/csp-report',
				),
				pattern: '',
			}) as Response

			// Should still return 204 — never leak errors to the client
			expect(response.status).toBe(204)

			consoleError.mockRestore()
			consoleWarn.mockRestore()
		})

		test('logs violation details to console', async () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

			const body = JSON.stringify({
				'csp-report': {
					'document-uri': 'https://shop.example.com/checkout',
					'referrer': '',
					'violated-directive': 'img-src',
					'effective-directive': 'img-src',
					'blocked-uri': 'https://untrusted.example.com/img.png',
					'line-number': 99,
					'source-file': 'https://shop.example.com/checkout',
					'script-sample': '',
				},
			})

			const request = new Request(
				'http://localhost:3000/resources/csp-report',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/csp-report',
					},
					body,
				},
			)

			const response = await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/csp-report',
				),
				pattern: '',
			}) as Response

			expect(response.status).toBe(204)
			expect(consoleSpy).toHaveBeenCalled()
			// The log should contain the violation details
			const logArgs = consoleSpy.mock.calls[0]!
			expect(logArgs).toBeDefined()
			expect(logArgs.some((arg: unknown) =>
				typeof arg === 'string' && arg.includes('img-src'),
			)).toBe(true)

			consoleSpy.mockRestore()
		})

		test('handles JSON without csp-report key gracefully', async () => {
			const body = JSON.stringify({ some: 'other', data: true })

			const request = new Request(
				'http://localhost:3000/resources/csp-report',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/csp-report',
					},
					body,
				},
			)

			const response = await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/csp-report',
				),
				pattern: '',
			}) as Response

			expect(response.status).toBe(204)
		})
	})

	// ─── Method rejection ────────────────────────────────────────────

	describe('method validation', () => {
		test('loader rejects GET with 405', async () => {
			const response = await loader() as Response
			expect(response.status).toBe(405)
			const body = await response.text()
			expect(body).toBe('Method not allowed')
		})
	})

	// ─── Response structure ──────────────────────────────────────────

	describe('response structure', () => {
		test('204 responses have no body', async () => {
			// CSP report with csp-report key triggers console.warn
			consoleWarn.mockImplementation(() => {})
			consoleError.mockImplementation(() => {})

			const body = JSON.stringify({
				'csp-report': {
					'document-uri': 'https://shop.example.com/',
					'violated-directive': 'script-src',
					'blocked-uri': 'eval',
				},
			})

			const request = new Request(
				'http://localhost:3000/resources/csp-report',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/csp-report',
					},
					body,
				},
			)

			const response = await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/csp-report',
				),
				pattern: '',
			}) as Response

			expect(response.status).toBe(204)
			expect(response.headers.get('content-type')).toBeNull()
			const responseBody = await response.text()
			expect(responseBody).toBe('')

			consoleWarn.mockRestore()
			consoleError.mockRestore()
		})
	})
})
