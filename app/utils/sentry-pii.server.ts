import type { Event } from '@sentry/react-router'

/**
 * Sensitive header names that should never be sent to Sentry.
 * These contain authentication tokens, session cookies, and API keys.
 */
const SENSITIVE_HEADERS = [
	'authorization',
	'cookie',
	'set-cookie',
	'x-api-key',
	'x-csrf-token',
	'x-xsrf-token',
	'x-csrftoken',
	'csrf-token',
	'x-forwarded-for',
	'x-real-ip',
	'fly-client-ip',
	'cf-connecting-ip',
	'true-client-ip',
	'x-vercel-ip-country',
]

/**
 * Sensitive cookie name prefixes that should be redacted.
 */
const SENSITIVE_COOKIE_PREFIXES = [
	'_session',
	'session',
	'_csrf',
	'csrf',
	'__Host-',
	'__Secure-',
	'auth',
	'token',
]

/**
 * Patterns for sensitive data in request bodies and query strings.
 * Matches common PII fields: passwords, tokens, card numbers, etc.
 */
const SENSITIVE_BODY_FIELDS = [
	'password',
	'newPassword',
	'currentPassword',
	'confirmPassword',
	'token',
	'secret',
	'apiKey',
	'creditCard',
	'cardNumber',
	'cvc',
	'cvv',
	'ssn',
	'taxId',
	'idNumber',
]

/**
 * Redacts a header value by replacing it with '[Filtered]'.
 * For cookie headers, redacts individual cookie values while keeping names.
 */
function redactHeaderValue(name: string, value: string): string {
	const lowerName = name.toLowerCase()
	if (lowerName === 'cookie' || lowerName === 'set-cookie') {
		return redactCookieHeader(value)
	}
	return '[Filtered]'
}

/**
 * Redacts cookie values while preserving cookie names for debugging.
 * Example: "session=abc123; theme=dark" → "session=[Filtered]; theme=dark"
 */
function redactCookieHeader(cookieHeader: string): string {
	return cookieHeader
		.split(';')
		.map((cookie) => {
			const trimmed = cookie.trim()
			const eqIndex = trimmed.indexOf('=')
			if (eqIndex === -1) return trimmed
			const name = trimmed.slice(0, eqIndex)
			if (isSensitiveCookieName(name)) {
				return `${name}=[Filtered]`
			}
			return trimmed
		})
		.join('; ')
}

/**
 * Checks if a cookie name matches sensitive prefixes.
 */
function isSensitiveCookieName(name: string): boolean {
	const lowerName = name.toLowerCase().trim()
	return SENSITIVE_COOKIE_PREFIXES.some(
		(prefix) =>
			lowerName.startsWith(prefix.toLowerCase()) ||
			lowerName === prefix.toLowerCase(),
	)
}

/**
 * Redacts sensitive fields from a request body.
 * Handles string bodies (JSON, URL-encoded) and object bodies.
 */
function redactRequestBody(body: unknown): unknown {
	if (typeof body === 'string') {
		try {
			const parsed = JSON.parse(body)
			if (typeof parsed === 'object' && parsed !== null) {
				return JSON.stringify(redactObjectFields(parsed as Record<string, unknown>))
			}
		} catch {
			// Not JSON — try URL-encoded
			return redactUrlEncodedBody(body)
		}
		return body
	}

	if (typeof body === 'object' && body !== null) {
		return redactObjectFields(body as Record<string, unknown>)
	}

	return body
}

/**
 * Redacts sensitive fields from a URL-encoded body string.
 */
function redactUrlEncodedBody(body: string): string {
	return body
		.split('&')
		.map((pair) => {
			const eqIndex = pair.indexOf('=')
			if (eqIndex === -1) return pair
			const key = decodeURIComponent(pair.slice(0, eqIndex))
			if (isSensitiveBodyField(key)) {
				return `${pair.slice(0, eqIndex)}=[Filtered]`
			}
			return pair
		})
		.join('&')
}

/**
 * Recursively redacts sensitive fields from an object.
 */
function redactObjectFields(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(obj)) {
		if (isSensitiveBodyField(key)) {
			result[key] = '[Filtered]'
		} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			result[key] = redactObjectFields(value as Record<string, unknown>)
		} else {
			result[key] = value
		}
	}
	return result
}

/**
 * Checks if a field name matches sensitive patterns.
 * Case-insensitive partial match.
 */
function isSensitiveBodyField(fieldName: string): boolean {
	const lower = fieldName.toLowerCase()
	return SENSITIVE_BODY_FIELDS.some(
		(pattern) =>
			lower === pattern.toLowerCase() || lower.includes(pattern.toLowerCase()),
	)
}

/**
 * Creates a Sentry beforeSend hook that strips PII from events.
 *
 * Redacts:
 * - Sensitive HTTP headers (Authorization, Cookie, etc.)
 * - Sensitive request body fields (passwords, tokens, card numbers)
 * - IP addresses from headers (X-Forwarded-For, Fly-Client-Ip, etc.)
 * - Session cookies while preserving non-sensitive cookies
 *
 * Usage:
 * ```ts
 * Sentry.init({
 *   beforeSend: createBeforeSendHook(),
 *   // ...
 * })
 * ```
 */
export function createBeforeSendHook<T extends Event = Event>(): (
	event: T,
	_hint?: unknown,
) => T | null {
	return (event: T, _hint?: unknown): T | null => {
		// Redact sensitive headers from request
		if (event.request?.headers) {
			const headers: Record<string, string> = {}
			for (const [key, value] of Object.entries(event.request.headers)) {
				const lowerKey = key.toLowerCase()
				if (SENSITIVE_HEADERS.includes(lowerKey)) {
					headers[key] = redactHeaderValue(key, value as string)
				} else {
					headers[key] = value as string
				}
			}
			event.request.headers = headers
		}

		// Redact sensitive data from request body
		if (event.request?.data) {
			event.request.data = redactRequestBody(event.request.data) as string
		}

		// Redact sensitive cookies from request (nested in cookies property if present)
		if (event.request?.cookies) {
			const cookies: Record<string, string> = {}
			for (const [name, value] of Object.entries(event.request.cookies)) {
				if (isSensitiveCookieName(name)) {
					cookies[name] = '[Filtered]'
				} else {
					cookies[name] = value as string
				}
			}
			event.request.cookies = cookies
		}

		return event
	}
}

/**
 * Creates a Sentry beforeSendTransaction hook that strips PII from
 * transaction/performance events.
 */
export function createBeforeSendTransactionHook<
	T extends Event = Event,
>(): (event: T, _hint?: unknown) => T | null {
	return (event: T, _hint?: unknown): T | null => {
		// Strip query strings from URLs that may contain PII
		// (address data is passed as query params in checkout flow)
		if (event.request?.url) {
			try {
				const url = new URL(event.request.url)
				// Redact sensitive query parameters
				const sensitiveParams = [
					'email',
					'name',
					'street',
					'city',
					'state',
					'postal',
					'country',
					'customerVatNumber',
				]
				for (const param of sensitiveParams) {
					if (url.searchParams.has(param)) {
						url.searchParams.set(param, '[Filtered]')
					}
				}
				event.request.url = url.toString()
			} catch {
				// If URL parsing fails, keep original
			}
		}

		// Also apply the standard PII stripping
		const beforeSend = createBeforeSendHook()
		return beforeSend(event) as T | null
	}
}
