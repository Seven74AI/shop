/**
 * @vitest-environment node
 */
import { describe, expect, test, vi } from 'vitest'
import { action } from './csp-report.tsx'

// Mock Sentry before importing the module that uses it
vi.mock('@sentry/react-router', async () => {
	const actual = await vi.importActual('@sentry/react-router')
	return {
		...actual,
		captureMessage: vi.fn(),
	}
})

describe('CSP Report route', () => {
	test('accepts valid CSP report JSON and returns 200', async () => {
		const report = {
			'csp-report': {
				'document-uri': 'https://example.com/page',
				'referrer': '',
				'blocked-uri': 'https://evil.com/script.js',
				'violated-directive': 'script-src-elem',
				'effective-directive': 'script-src-elem',
				'original-policy': "script-src 'self' 'unsafe-inline' https://js.stripe.com",
				'disposition': 'report',
				'script-sample': '',
				'status-code': 200,
			},
		}

		const request = new Request('http://localhost:3000/resources/csp-report', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(report),
		})

		const result = await action({
			request,
			params: {},
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		expect(result).toBeInstanceOf(Response)
		if (result instanceof Response) {
			expect(result.status).toBe(200)
			const body = await result.json()
			expect(body).toEqual({ received: true })
		}
	})

	test('handles malformed JSON gracefully and returns 200', async () => {
		const request = new Request('http://localhost:3000/resources/csp-report', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not valid json {{{',
		})

		const result = await action({
			request,
			params: {},
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		expect(result).toBeInstanceOf(Response)
		if (result instanceof Response) {
			expect(result.status).toBe(200)
			const body = await result.json()
			expect(body).toEqual({ received: true })
		}
	})

	test('handles empty body gracefully and returns 200', async () => {
		const request = new Request('http://localhost:3000/resources/csp-report', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
		})

		const result = await action({
			request,
			params: {},
			context: {}, url: new URL('http://localhost'), pattern: '',
		})

		expect(result).toBeInstanceOf(Response)
		if (result instanceof Response) {
			expect(result.status).toBe(200)
			const body = await result.json()
			expect(body).toEqual({ received: true })
		}
	})
})
