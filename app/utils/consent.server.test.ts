import { describe, expect, test } from 'vitest'
import {
	COOKIE_NAME,
	DEFAULT_CONSENT,
	hasConsentCookie,
	parseConsentCookie,
	setConsentCookie,
	type ConsentPreferences,
} from './consent.server.ts'

function createRequest(cookieHeader?: string): Request {
	return new Request('https://example.com/', {
		headers: cookieHeader ? { cookie: cookieHeader } : {},
	})
}

describe('consent.server', () => {
	describe('parseConsentCookie', () => {
		test('returns null when no cookie header present', () => {
			const request = createRequest()
			expect(parseConsentCookie(request)).toBeNull()
		})

		test('returns null when cookie header has no consent cookie', () => {
			const request = createRequest('session=abc123; locale=en')
			expect(parseConsentCookie(request)).toBeNull()
		})

		test('parses a valid consent cookie', () => {
			const request = createRequest(
				`${COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ necessary: true, analytics: true, marketing: false }))}`,
			)
			const result = parseConsentCookie(request)
			expect(result).toEqual({
				necessary: true,
				analytics: true,
				marketing: false,
			})
		})

		test('parses consent cookie alongside other cookies', () => {
			const request = createRequest(
				`session=abc123; ${COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ necessary: true, analytics: false, marketing: false }))}; locale=en`,
			)
			const result = parseConsentCookie(request)
			expect(result).toEqual({
				necessary: true,
				analytics: false,
				marketing: false,
			})
		})

		test('returns null for invalid JSON in cookie', () => {
			const request = createRequest(`${COOKIE_NAME}=not-json`)
			expect(parseConsentCookie(request)).toBeNull()
		})

		test('returns null for malformed consent object (missing necessary)', () => {
			const request = createRequest(
				`${COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ analytics: true }))}`,
			)
			expect(parseConsentCookie(request)).toBeNull()
		})

		test('returns null when necessary is false', () => {
			const request = createRequest(
				`${COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ necessary: false, analytics: true, marketing: true }))}`,
			)
			expect(parseConsentCookie(request)).toBeNull()
		})
	})

	describe('setConsentCookie', () => {
		test('serializes consent preferences to a cookie string', () => {
			const prefs: ConsentPreferences = {
				necessary: true,
				analytics: true,
				marketing: false,
			}
			const cookie = setConsentCookie(prefs)
			expect(cookie).toContain(COOKIE_NAME)
			expect(cookie).toContain('Path=/')
			expect(cookie).toContain('SameSite=Lax')
			expect(cookie).toContain('Max-Age=')
			// Verify the value decodes back to the original prefs
			const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
			expect(match).not.toBeNull()
			const decoded = decodeURIComponent(match![1]!)
			expect(JSON.parse(decoded)).toEqual(prefs)
		})

		test('accept all prefs — sets all to true', () => {
			const cookie = setConsentCookie({
				necessary: true,
				analytics: true,
				marketing: true,
			})
			const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
			expect(match).not.toBeNull()
			expect(JSON.parse(decodeURIComponent(match![1]!))).toEqual({
				necessary: true,
				analytics: true,
				marketing: true,
			})
		})

		test('decline all prefs — only necessary is true', () => {
			const cookie = setConsentCookie({
				necessary: true,
				analytics: false,
				marketing: false,
			})
			const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
			expect(match).not.toBeNull()
			expect(JSON.parse(decodeURIComponent(match![1]!))).toEqual({
				necessary: true,
				analytics: false,
				marketing: false,
			})
		})
	})

	describe('hasConsentCookie', () => {
		test('returns false when no cookie header', () => {
			const request = createRequest()
			expect(hasConsentCookie(request)).toBe(false)
		})

		test('returns false when cookie header has no consent', () => {
			const request = createRequest('session=abc123')
			expect(hasConsentCookie(request)).toBe(false)
		})

		test('returns true when valid consent cookie present', () => {
			const request = createRequest(
				`${COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ necessary: true, analytics: true, marketing: false }))}`,
			)
			expect(hasConsentCookie(request)).toBe(true)
		})

		test('returns false when consent cookie is invalid JSON', () => {
			const request = createRequest(`${COOKIE_NAME}=bad-json`)
			expect(hasConsentCookie(request)).toBe(false)
		})
	})

	describe('DEFAULT_CONSENT', () => {
		test('DEFAULT_CONSENT has necessary=true and others false', () => {
			expect(DEFAULT_CONSENT).toEqual({
				necessary: true,
				analytics: false,
				marketing: false,
			})
		})
	})
})
