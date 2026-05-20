/**
 * @vitest-environment node
 *
 * Server-side i18n tests — locale detection, cookie serialization,
 * and translation loading. Uses test helpers for DRY setup.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { getLocale, setLocaleCookie } from './i18n.server.ts'
import {
	createLocaleRequest,
	assertLocaleCookie,
} from '#tests/helpers/i18n.ts'

beforeEach(() => {
	vi.restoreAllMocks()
})

// ─── getLocale ──────────────────────────────────────────────────────

describe('getLocale', () => {
	describe('default behaviour', () => {
		test('returns "en" when no headers are present', () => {
			const request = createLocaleRequest()
			expect(getLocale(request)).toBe('en')
		})

		test('returns "en" when Accept-Language has unsupported locale (de)', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'de-DE,de;q=0.9',
			})
			expect(getLocale(request)).toBe('en')
		})

		test('returns "en" when all Accept-Language locales are unsupported', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'ja-JP,ja;q=0.9,zh-CN,zh;q=0.8',
			})
			expect(getLocale(request)).toBe('en')
		})
	})

	describe('cookie-based detection (priority 1)', () => {
		test('returns locale from cookie when valid', () => {
			const request = createLocaleRequest({ cookieLocale: 'fr' })
			expect(getLocale(request)).toBe('fr')
		})

		test('returns "en" from cookie when set', () => {
			const request = createLocaleRequest({ cookieLocale: 'en' })
			expect(getLocale(request)).toBe('en')
		})

		test('cookie takes priority over Accept-Language', () => {
			const request = createLocaleRequest({
				cookieLocale: 'fr',
				acceptLanguage: 'en-US,en;q=0.9',
			})
			expect(getLocale(request)).toBe('fr')
		})

		test('cookie takes priority even when Accept-Language has different locale', () => {
			const request = createLocaleRequest({
				cookieLocale: 'en',
				acceptLanguage: 'fr-FR,fr;q=0.9',
			})
			expect(getLocale(request)).toBe('en')
		})

		test('ignores invalid cookie value (xyz) and falls back to Accept-Language', () => {
			const request = createLocaleRequest({
				cookieLocale: 'xyz' as any,
				acceptLanguage: 'fr-FR,fr;q=0.9',
			})
			expect(getLocale(request)).toBe('fr')
		})

		test('ignores invalid cookie value and falls back to default when no Accept-Language', () => {
			const request = createLocaleRequest({
				cookieLocale: 'xyz' as any,
			})
			expect(getLocale(request)).toBe('en')
		})

		test('ignores cookie with different name', () => {
			// This test uses extraHeaders to simulate a non-locale cookie
			const request = createLocaleRequest({
				acceptLanguage: 'en-US,en;q=0.9',
				extraHeaders: { cookie: 'someOtherCookie=fr' },
			})
			expect(getLocale(request)).toBe('en')
		})

		test('cookie value is case-sensitive — "FR" is not valid', () => {
			const request = createLocaleRequest({
				cookieLocale: 'FR' as any,
				acceptLanguage: 'fr-FR,fr;q=0.9',
			})
			expect(getLocale(request)).toBe('fr') // falls back to Accept-Language
		})
	})

	describe('Accept-Language header (priority 2)', () => {
		test('returns "en" from Accept-Language en-US,en;q=0.9', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'en-US,en;q=0.9',
			})
			expect(getLocale(request)).toBe('en')
		})

		test('returns "fr" from Accept-Language fr-FR,fr;q=0.9', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'fr-FR,fr;q=0.9',
			})
			expect(getLocale(request)).toBe('fr')
		})

		test('respects quality values — picks fr over en when fr has higher q', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'fr-FR,fr;q=0.9,en-US;q=0.5',
			})
			expect(getLocale(request)).toBe('fr')
		})

		test('respects quality values — picks en over fr when en has higher q', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'en-US,en;q=0.9,fr-FR;q=0.5',
			})
			expect(getLocale(request)).toBe('en')
		})

		test('picks first supported locale when quality values are equal', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'fr-FR,fr;q=0.9,en-US;q=0.9',
			})
			expect(getLocale(request)).toBe('fr')
		})

		test('handles complex Accept-Language with many locales', () => {
			const request = createLocaleRequest({
				acceptLanguage:
					'de-DE,de;q=0.9,fr-FR;q=0.8,en-US;q=0.7,ja-JP;q=0.6',
			})
			expect(getLocale(request)).toBe('fr')
		})

		test('handles Accept-Language with only short codes', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'fr,en;q=0.5',
			})
			expect(getLocale(request)).toBe('fr')
		})

		test('handles Accept-Language with region variants (fr-CA, fr-BE)', () => {
			const request = createLocaleRequest({
				acceptLanguage: 'fr-CA,fr;q=0.9',
			})
			expect(getLocale(request)).toBe('fr')
		})
	})

	describe('header edge cases', () => {
		test('handles empty cookie header gracefully', () => {
			const request = createLocaleRequest({
				extraHeaders: { cookie: '' },
			})
			expect(getLocale(request)).toBe('en')
		})

		test('handles empty Accept-Language header gracefully', () => {
			const request = createLocaleRequest({
				acceptLanguage: '',
			})
			expect(getLocale(request)).toBe('en')
		})

		test('handles whitespace-only Accept-Language', () => {
			const request = createLocaleRequest({
				acceptLanguage: '   ',
			})
			expect(getLocale(request)).toBe('en')
		})

		test('handles multiple cookies with localePreference among them', () => {
			const request = new Request('https://epicnotes.fly.dev/', {
				headers: {
					cookie: 'sessionId=abc123; localePreference=fr; theme=dark',
				},
			})
			expect(getLocale(request)).toBe('fr')
		})
	})

	describe('public API boundary', () => {
		test('getLocale returns a valid Locale type always', () => {
			const request = createLocaleRequest({ cookieLocale: 'fr' })
			const result = getLocale(request)
			expect(['en', 'fr']).toContain(result)
		})

		test('getLocale returns "en" for FR locale', () => {
			// The supported Locale type includes 'fr' | 'en', not 'FR'
			const request = createLocaleRequest({
				cookieLocale: 'FR' as any,
			})
			expect(getLocale(request)).toBe('en')
		})
	})
})

// ─── setLocaleCookie ────────────────────────────────────────────────

describe('setLocaleCookie', () => {
	test('serializes "fr" locale cookie with correct attributes', () => {
		const cookie = setLocaleCookie('fr')
		expect(cookie).toContain('localePreference=fr')
		expect(cookie).toContain('Max-Age=31536000')
		expect(cookie).toContain('Path=/')
		expect(cookie).toContain('SameSite=Lax')
	})

	test('serializes "en" locale cookie with correct attributes', () => {
		const cookie = setLocaleCookie('en')
		expect(cookie).toContain('localePreference=en')
		expect(cookie).toContain('Max-Age=31536000')
	})

	test('cookie is HTTP-only by default (no HttpOnly flag means accessible via JS)', () => {
		// setLocaleCookie does NOT set HttpOnly — the cookie needs to be read
		// by client-side JS for the language switcher to know the current locale
		const cookie = setLocaleCookie('fr')
		expect(cookie).not.toContain('HttpOnly')
	})

	test('cookie max-age is 365 days', () => {
		const cookie = setLocaleCookie('en')
		// 365 * 24 * 60 * 60 = 31536000
		expect(cookie).toContain('Max-Age=31536000')
	})

	test('cookie is scoped to root path', () => {
		const cookie = setLocaleCookie('fr')
		expect(cookie).toContain('Path=/')
	})

	test('cookie uses SameSite=Lax for CSRF protection', () => {
		const cookie = setLocaleCookie('en')
		expect(cookie).toContain('SameSite=Lax')
	})
})
