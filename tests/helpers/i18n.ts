/**
 * i18n Test Helpers
 *
 * Utilities for testing locale-aware components, server-side i18n logic,
 * and the locale-switch action. Reduces boilerplate in test files and
 * ensures consistent test setup across the test suite.
 *
 * Usage:
 *   import { createLocaleRequest, createMockTranslations } from '#tests/helpers/i18n.ts'
 */

import { type TranslationDict, type Locale } from '#app/utils/i18n.server.ts'

// ─── Server-side helpers (node environment) ─────────────────────────

/**
 * Test fixtures for common translations in both supported locales.
 * Use `createMockTranslations()` to get locale-specific dicts.
 */
export const MOCK_EN_TRANSLATIONS: TranslationDict = {
	'site.title': 'Epic Notes',
	'site.description': "Your own captain's log",
	'nav.home': 'Home',
	'nav.shop': 'Shop',
	'nav.login': 'Log In',
	'nav.cart': 'Cart',
	'footer.copyright': '© {year} Epic Notes. All rights reserved.',
	'footer.locale.label': 'Language',
	'footer.locale.en': 'English',
	'footer.locale.fr': 'Français',
	'search.placeholder': 'Search...',
	'error.general': 'Something went wrong',
	'error.notFound': 'Page not found',
	'locale.switched': 'Language changed to {locale}',
	greeting: 'Hello {name}',
	cartCount: 'You have {count} items in your cart',
	noVars: 'This has no variables',
	multivar: '{greeting}, {name}. You are {age} years old.',
}

export const MOCK_FR_TRANSLATIONS: TranslationDict = {
	'site.title': 'Epic Notes',
	'site.description': 'Votre journal de bord',
	'nav.home': 'Accueil',
	'nav.shop': 'Boutique',
	'nav.login': 'Connexion',
	'nav.cart': 'Panier',
	'footer.copyright': '© {year} Epic Notes. Tous droits réservés.',
	'footer.locale.label': 'Langue',
	'footer.locale.en': 'English',
	'footer.locale.fr': 'Français',
	'search.placeholder': 'Rechercher...',
	'error.general': 'Une erreur est survenue',
	'error.notFound': 'Page introuvable',
	'locale.switched': 'Langue changée en {locale}',
	greeting: 'Bonjour {name}',
	cartCount: 'Vous avez {count} articles dans votre panier',
	noVars: 'Ceci n\'a pas de variables',
	multivar: '{greeting}, {name}. Vous avez {age} ans.',
}

/**
 * Returns a mock translations dictionary for a given locale.
 */
export function createMockTranslations(locale: Locale = 'en'): TranslationDict {
	return locale === 'fr'
		? { ...MOCK_FR_TRANSLATIONS }
		: { ...MOCK_EN_TRANSLATIONS }
}

/**
 * Creates a Request with locale-related headers for testing getLocale().
 *
 * @example
 *   // Request with French cookie
 *   const req = createLocaleRequest({ cookieLocale: 'fr' })
 *
 *   // Request with Accept-Language header
 *   const req = createLocaleRequest({ acceptLanguage: 'fr-FR,fr;q=0.9' })
 *
 *   // Request with both cookie and Accept-Language (cookie wins)
 *   const req = createLocaleRequest({
 *     cookieLocale: 'fr',
 *     acceptLanguage: 'en-US,en;q=0.9',
 *   })
 *
 *   // Request with custom URL
 *   const req = createLocaleRequest({ url: 'https://myshop.com/products' })
 */
export function createLocaleRequest(opts: {
	cookieLocale?: Locale | 'invalid'
	acceptLanguage?: string
	url?: string
	extraHeaders?: Record<string, string>
} = {}): Request {
	const headers: Record<string, string> = { ...opts.extraHeaders }

	if (opts.cookieLocale) {
		headers.cookie =
			`localePreference=${opts.cookieLocale}` +
			(headers.cookie ? `; ${headers.cookie}` : '')
	}

	if (opts.acceptLanguage) {
		headers['accept-language'] = opts.acceptLanguage
	}

	return new Request(opts.url ?? 'https://epicnotes.fly.dev/', { headers })
}

/**
 * Serialize a localePreference cookie string for tests.
 * Mirrors what the server sends via setLocaleCookie().
 */
export function makeLocaleCookie(locale: Locale): string {
	return `localePreference=${locale}`
}

/**
 * Create FormData for the locale-switch POST action.
 */
export function makeLocaleFormData(
	locale: Locale,
	redirectTo?: string,
): FormData {
	const formData = new FormData()
	formData.append('locale', locale)
	if (redirectTo) {
		formData.append('redirectTo', redirectTo)
	}
	return formData
}

/**
 * Create a Request for the locale-switch POST action.
 */
export function makeLocaleSwitchRequest(
	locale: Locale | 'invalid',
	redirectTo?: string,
): Request {
	const formData = makeLocaleFormData(
		locale as Locale,
		redirectTo,
	)
	return new Request(
		'http://localhost:3000/resources/locale-switch',
		{
			method: 'POST',
			body: formData,
		},
	)
}

// ─── Assertion helpers ──────────────────────────────────────────────

/**
 * Assert that a Response (from locale-switch action) sets the correct
 * locale cookie with expected properties.
 */
export function assertLocaleCookie(
	response: Response,
	expectedLocale: Locale,
	expectedMaxAge = 31536000, // 365 days
): void {
	const setCookie = response.headers.get('set-cookie')
	if (!setCookie) {
		throw new Error('Expected set-cookie header to be present')
	}
	if (!setCookie.includes(`localePreference=${expectedLocale}`)) {
		throw new Error(
			`Expected set-cookie to contain localePreference=${expectedLocale}, got: ${setCookie}`,
		)
	}
	if (!setCookie.includes(`Max-Age=${expectedMaxAge}`)) {
		throw new Error(
			`Expected set-cookie to contain Max-Age=${expectedMaxAge}, got: ${setCookie}`,
		)
	}
	if (!setCookie.includes('Path=/')) {
		throw new Error(
			`Expected set-cookie to contain Path=/, got: ${setCookie}`,
		)
	}
	if (!setCookie.includes('SameSite=Lax')) {
		throw new Error(
			`Expected set-cookie to contain SameSite=Lax, got: ${setCookie}`,
		)
	}
}

/**
 * Assert that a redirect response has the correct status and location.
 */
export function assertRedirect(
	response: Response,
	expectedLocation: string,
	expectedStatus = 302,
): void {
	if (response.status !== expectedStatus) {
		throw new Error(
			`Expected status ${expectedStatus}, got ${response.status}`,
		)
	}
	const location = response.headers.get('location')
	if (location !== expectedLocation) {
		throw new Error(
			`Expected location "${expectedLocation}", got "${location}"`,
		)
	}
}

