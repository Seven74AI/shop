/**
 * @vitest-environment node
 */
import { describe, expect, test } from 'vitest'
import { getLocale } from './i18n.server.ts'

function makeRequest(headers: Record<string, string> = {}): Request {
	return new Request('https://epicnotes.fly.dev/', { headers })
}

describe('getLocale', () => {
	test('returns "en" when no headers are present', () => {
		const request = makeRequest()
		expect(getLocale(request)).toBe('en')
	})

	test('returns locale from cookie when valid', () => {
		const request = makeRequest({
			cookie: 'localePreference=fr',
		})
		expect(getLocale(request)).toBe('fr')
	})

	test('returns locale from cookie over Accept-Language', () => {
		const request = makeRequest({
			cookie: 'localePreference=fr',
			'accept-language': 'en-US,en;q=0.9',
		})
		expect(getLocale(request)).toBe('fr')
	})

	test('returns "en" from Accept-Language en-US,en;q=0.9', () => {
		const request = makeRequest({
			'accept-language': 'en-US,en;q=0.9',
		})
		expect(getLocale(request)).toBe('en')
	})

	test('returns "fr" from Accept-Language fr-FR,fr;q=0.9', () => {
		const request = makeRequest({
			'accept-language': 'fr-FR,fr;q=0.9',
		})
		expect(getLocale(request)).toBe('fr')
	})

	test('returns "en" when Accept-Language has unsupported locale (de)', () => {
		const request = makeRequest({
			'accept-language': 'de-DE,de;q=0.9',
		})
		expect(getLocale(request)).toBe('en')
	})

	test('respects quality values — picks fr over en when fr has higher q', () => {
		const request = makeRequest({
			'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.5',
		})
		expect(getLocale(request)).toBe('fr')
	})

	test('respects quality values — picks en over fr when en has higher q', () => {
		const request = makeRequest({
			'accept-language': 'en-US,en;q=0.9,fr-FR;q=0.5',
		})
		expect(getLocale(request)).toBe('en')
	})

	test('ignores invalid cookie value (xyz) and falls back to Accept-Language', () => {
		const request = makeRequest({
			cookie: 'localePreference=xyz',
			'accept-language': 'fr-FR,fr;q=0.9',
		})
		expect(getLocale(request)).toBe('fr')
	})

	test('ignores cookie with different name', () => {
		const request = makeRequest({
			cookie: 'someOtherCookie=fr',
			'accept-language': 'en-US,en;q=0.9',
		})
		expect(getLocale(request)).toBe('en')
	})
})
