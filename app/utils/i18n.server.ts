import { cachified } from '@epic-web/cachified'
import * as cookie from 'cookie'
import { parseAcceptLanguage } from 'intl-parse-accept-language'
import { lruCache } from '#app/utils/cache.server.ts'

export type Locale = 'fr' | 'en'
export type TranslationDict = Record<string, string>

const COOKIE_NAME = 'localePreference'

/**
 * Recursively flatten a nested object into dot-notation keys.
 *   { footer: { locale: { en: "English" } } } → { "footer.locale.en": "English" }
 */
function flattenObject(
	obj: Record<string, unknown>,
	prefix = '',
): Record<string, string> {
	const result: Record<string, string> = {}
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			Object.assign(
				result,
				flattenObject(value as Record<string, unknown>, fullKey),
			)
		} else {
			result[fullKey] = String(value)
		}
	}
	return result
}
const SUPPORTED_LOCALES: Locale[] = ['fr', 'en']
const DEFAULT_LOCALE: Locale = 'en'

/**
 * Detect the preferred locale from the request.
 *
 * Priority:
 * 1. `localePreference` cookie (explicit user choice)
 * 2. `Accept-Language` header (browser preference)
 * 3. Default to 'en'
 */
export function getLocale(request: Request): Locale {
	// 1. Check cookie first (explicit user preference)
	const cookieHeader = request.headers.get('cookie')
	if (cookieHeader) {
		const parsed = cookie.parse(cookieHeader)
		const cookieLocale = parsed[COOKIE_NAME]
		if (isSupportedLocale(cookieLocale)) {
			return cookieLocale
		}
	}

	// 2. Parse Accept-Language header
	const acceptLanguage = request.headers.get('accept-language')
	if (acceptLanguage) {
		const parsed = parseAcceptLanguage(acceptLanguage)
		for (const lang of parsed) {
			const shortLocale = ensureShortLocale(lang)
			if (isSupportedLocale(shortLocale)) {
				return shortLocale
			}
		}
	}

	// 3. Default
	return DEFAULT_LOCALE
}

/**
 * Load translations for a given locale.
 * Cached in-memory via cachified / LRU.
 */
export async function getTranslations(
	locale: Locale,
): Promise<TranslationDict> {
	return cachified({
		key: `translations:${locale}`,
		cache: lruCache,
		async getFreshValue() {
			const mod = await import(
				`#app/locales/${locale}/common.json`
			)
			const raw = (mod.default ?? mod) as Record<string, unknown>
			// Flatten nested objects to dot-notation (e.g. footer.locale.en → "English")
			return flattenObject(raw)
		},
		ttl: 60 * 60 * 1000, // 1 hour
	})
}

/**
 * Serialize the locale preference cookie.
 */
export function setLocaleCookie(locale: Locale): string {
	return cookie.serialize(COOKIE_NAME, locale, {
		path: '/',
		maxAge: 365 * 24 * 60 * 60, // 1 year
		sameSite: 'lax',
	})
}

/**
 * Check if a string is a supported locale.
 */
function isSupportedLocale(value: string | undefined): value is Locale {
	if (!value) return false
	return SUPPORTED_LOCALES.includes(value as Locale)
}

/**
 * Ensure we only take the short locale code (e.g., 'fr-FR' → 'fr').
 */
function ensureShortLocale(lang: string): string {
	return lang.split('-')[0]!.toLowerCase()
}
