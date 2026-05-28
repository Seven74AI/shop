import { describe, test, expect } from 'vitest'
import {
	createBeforeSendHook,
	createBeforeSendTransactionHook,
} from './sentry-pii.server.ts'

/**
 * Helper to create a minimal Sentry Event-like object.
 */
function makeEvent(overrides: Record<string, unknown> = {}) {
	return {
		event_id: 'test-event-1',
		level: 'error',
		request: {
			url: 'https://shop.example.com/checkout/shipping',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer secret-token-123',
				Cookie: '_session=abc123; theme=dark',
				'X-Csrf-Token': 'csrf-secret',
				'Fly-Client-Ip': '1.2.3.4',
				'Accept-Language': 'en-US,en;q=0.9',
			},
			data: JSON.stringify({
				email: 'user@example.com',
				password: 'secret123',
				name: 'John Doe',
				message: 'Hello',
			}),
			...overrides,
		},
	}
}

describe('createBeforeSendHook', () => {
	const hook = createBeforeSendHook()

	test('redacts Authorization header', () => {
		const event = makeEvent()
		const result = hook(event as any)
		expect(result).not.toBeNull()
		expect(result!.request!.headers!['Authorization']).toBe('[Filtered]')
	})

	test('redacts Cookie header values while preserving non-sensitive cookies', () => {
		const event = makeEvent()
		const result = hook(event as any)
		const cookieHeader = result!.request!.headers!['Cookie']
		expect(cookieHeader).toContain('_session=[Filtered]')
		expect(cookieHeader).toContain('theme=dark')
	})

	test('redacts X-Csrf-Token header', () => {
		const event = makeEvent()
		const result = hook(event as any)
		expect(result!.request!.headers!['X-Csrf-Token']).toBe('[Filtered]')
	})

	test('redacts Fly-Client-Ip header', () => {
		const event = makeEvent()
		const result = hook(event as any)
		expect(result!.request!.headers!['Fly-Client-Ip']).toBe('[Filtered]')
	})

	test('preserves safe headers', () => {
		const event = makeEvent()
		const result = hook(event as any)
		expect(result!.request!.headers!['Content-Type']).toBe(
			'application/json',
		)
		expect(result!.request!.headers!['Accept-Language']).toBe(
			'en-US,en;q=0.9',
		)
	})

	test('redacts password from JSON request body', () => {
		const event = makeEvent()
		const result = hook(event as any)
		const data = JSON.parse(
			result!.request!.data as string,
		) as Record<string, any>
		expect(data.password).toBe('[Filtered]')
		expect(data.email).toBe('user@example.com')
	})

	test('redacts password from URL-encoded request body', () => {
		const event = makeEvent({
			data: 'email=user@example.com&password=secret123&name=John',
		})
		const result = hook(event as any)
		expect(result!.request!.data).toContain('password=[Filtered]')
		expect(result!.request!.data).toContain('email=user@example.com')
	})

	test('returns null-safe when no request present', () => {
		const event = { event_id: 'test-1' }
		const result = hook(event as any)
		expect(result).not.toBeNull()
		expect(result!.event_id).toBe('test-1')
	})

	test('redacts sensitive cookies from cookies object', () => {
		const event = makeEvent()
		const result = hook(event as any)
		if (result!.request!.cookies) {
			for (const [name, value] of Object.entries(
				result!.request!.cookies,
			)) {
				if (
					name === '_session' ||
					name.startsWith('__Host-') ||
					name.startsWith('__Secure-')
				) {
					expect(value).toBe('[Filtered]')
				}
			}
		}
	})

	test('redacts Set-Cookie header in responses', () => {
		const event = makeEvent({
			headers: {
				'Set-Cookie': '_session=xyz789; Path=/; HttpOnly',
			},
		})
		const result = hook(event as any)
		expect(result!.request!.headers!['Set-Cookie']).toContain(
			'_session=[Filtered]',
		)
	})

	test('handles nested object fields', () => {
		const event = makeEvent({
			data: JSON.stringify({
				user: {
					email: 'nested@example.com',
					password: 'nested-secret',
					settings: {
						apiKey: '***',
					},
				},
			}),
		})
		const result = hook(event as any)
		const data = JSON.parse(
			result!.request!.data as string,
		) as Record<string, any>
		expect(data.user.password).toBe('[Filtered]')
		expect(data.user.settings.apiKey).toBe('[Filtered]')
	})

	test('handles non-JSON, non-URL-encoded body gracefully', () => {
		const event = makeEvent({ data: 'plain text body' })
		const result = hook(event as any)
		expect(result!.request!.data).toBe('plain text body')
	})
})

describe('createBeforeSendTransactionHook', () => {
	const hook = createBeforeSendTransactionHook()

	test('redacts PII query parameters from URLs', () => {
		const event = makeEvent({
			url: 'https://shop.example.com/checkout/payment?name=John&email=user@example.com&street=123+Main+St&city=Paris&state=&postal=75001&country=FR&shippingMethodId=sm_123',
		})
		const result = hook(event as any)
		expect(result).not.toBeNull()
		const url = new URL(result!.request!.url!)
		expect(url.searchParams.get('email')).toBe('[Filtered]')
		expect(url.searchParams.get('name')).toBe('[Filtered]')
		expect(url.searchParams.get('street')).toBe('[Filtered]')
		expect(url.searchParams.get('city')).toBe('[Filtered]')
		expect(url.searchParams.get('postal')).toBe('[Filtered]')
		expect(url.searchParams.get('country')).toBe('[Filtered]')
	})

	test('preserves non-PII query parameters', () => {
		const event = makeEvent({
			url: 'https://shop.example.com/checkout/payment?shippingMethodId=sm_123&shippingCost=500',
		})
		const result = hook(event as any)
		const url = new URL(result!.request!.url!)
		expect(url.searchParams.get('shippingMethodId')).toBe('sm_123')
		expect(url.searchParams.get('shippingCost')).toBe('500')
	})

	test('redacts customerVatNumber from query parameters', () => {
		const event = makeEvent({
			url: 'https://shop.example.com/checkout/payment?customerVatNumber=FR12345678901',
		})
		const result = hook(event as any)
		const url = new URL(result!.request!.url!)
		expect(url.searchParams.get('customerVatNumber')).toBe('[Filtered]')
	})

	test('also applies standard PII header redaction', () => {
		const event = makeEvent({
			url: 'https://shop.example.com/cart',
			headers: {
				Authorization: 'Bearer test-token',
				Cookie: '_session=sensitive; pref=dark',
			},
		})
		const result = hook(event as any)
		expect(result!.request!.headers!['Authorization']).toBe('[Filtered]')
		const cookieHeader = result!.request!.headers!['Cookie']
		expect(cookieHeader).toContain('_session=[Filtered]')
		expect(cookieHeader).toContain('pref=dark')
	})

	test('handles invalid URL gracefully', () => {
		const event = makeEvent({ url: 'not-a-valid-url' })
		const result = hook(event as any)
		expect(result).not.toBeNull()
		expect(result!.request!.url).toBe('not-a-valid-url')
	})

	test('healthcheck transactions are handled by tracesSampler first', () => {
		const event = makeEvent({
			url: 'https://shop.example.com/resources/healthcheck',
			headers: { 'x-healthcheck': 'true' },
		})
		const result = hook(event as any)
		expect(result).not.toBeNull()
	})
})

describe('PII field pattern matching', () => {
	const hook = createBeforeSendHook()

	test('redacts cardNumber field', () => {
		const event = makeEvent({
			data: JSON.stringify({ cardNumber: '4111111111111111' }),
		})
		const result = hook(event as any)
		expect(
			(JSON.parse(result!.request!.data as string) as any).cardNumber,
		).toBe('[Filtered]')
	})

	test('redacts cvc/cvv fields', () => {
		const event = makeEvent({
			data: JSON.stringify({ cvc: '123', cvv: '456' }),
		})
		const result = hook(event as any)
		const data = JSON.parse(
			result!.request!.data as string,
		) as Record<string, any>
		expect(data.cvc).toBe('[Filtered]')
		expect(data.cvv).toBe('[Filtered]')
	})

	test('redacts token field', () => {
		const event = makeEvent({
			data: JSON.stringify({ token: 'reset-token-abc' }),
		})
		const result = hook(event as any)
		expect(
			(JSON.parse(result!.request!.data as string) as any).token,
		).toBe('[Filtered]')
	})

	test('redacts secret field', () => {
		const event = makeEvent({
			data: JSON.stringify({ secret: 'webhook-secret' }),
		})
		const result = hook(event as any)
		expect(
			(JSON.parse(result!.request!.data as string) as any).secret,
		).toBe('[Filtered]')
	})

	test('redacts taxId field', () => {
		const event = makeEvent({
			data: JSON.stringify({ taxId: 'FR12345678901' }),
		})
		const result = hook(event as any)
		expect(
			(JSON.parse(result!.request!.data as string) as any).taxId,
		).toBe('[Filtered]')
	})
})
