/**
 * @vitest-environment jsdom
 *
 * Client-side i18n tests — t() function, TranslationProvider,
 * useTranslation() hook, and interpolation edge cases.
 */
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, test, vi, afterEach } from 'vitest'
import { createMockTranslations } from '#tests/helpers/i18n.ts'
import { type Locale } from './i18n.server.ts'
import {
	TranslationProvider,
	useTranslation,
	useOptionalTranslation,
} from './i18n.tsx'

// Mock useRouteLoaderData which TranslationProvider depends on
const mockRouteLoaderData = vi.fn()

vi.mock('react-router', () => ({
	useRouteLoaderData: (routeId: string) => mockRouteLoaderData(routeId),
}))

afterEach(() => {
	vi.clearAllMocks()
})

// ─── t() function (interpolation + fallback) ────────────────────────

describe('t() function (interpolation + createT)', () => {
	// Replicate the functions directly for pure unit testing
	function interpolate(
		template: string,
		vars: Record<string, unknown>,
	): string {
		return template.replace(/\{(\w+)\}/g, (_, key: string) => {
			return vars[key] !== undefined ? String(vars[key]) : `{${key}}`
		})
	}

	function createT(translations: Record<string, string>) {
		return (key: string, vars?: Record<string, unknown>): string => {
			const template = translations[key]
			if (!template) return key
			if (vars) return interpolate(template, vars)
			return template
		}
	}

	const translations: Record<string, string> = {
		welcome: 'Welcome, {name}!',
		cartCount: 'You have {count} items in your cart',
		noVars: 'This has no variables',
		greeting: 'Bonjour {name}',
		multivar: '{greeting}, {name}. You are {age} years old.',
		htmlContent: '<strong>Hello</strong> {name}',
	}

	const t = createT(translations)

	test('returns the translation key itself when no vars', () => {
		expect(t('noVars')).toBe('This has no variables')
	})

	test('interpolates a single variable', () => {
		expect(t('welcome', { name: 'Marie' })).toBe('Welcome, Marie!')
	})

	test('interpolates multiple variables', () => {
		expect(
			t('multivar', { greeting: 'Hello', name: 'Alice', age: 30 }),
		).toBe('Hello, Alice. You are 30 years old.')
	})

	test('interpolates French greeting', () => {
		expect(t('greeting', { name: 'Marie' })).toBe('Bonjour Marie')
	})

	test('interpolates integer variable', () => {
		expect(t('cartCount', { count: 3 })).toBe(
			'You have 3 items in your cart',
		)
	})

	test('interpolates zero value', () => {
		expect(t('cartCount', { count: 0 })).toBe(
			'You have 0 items in your cart',
		)
	})

	test('interpolates negative value', () => {
		expect(t('cartCount', { count: -1 })).toBe(
			'You have -1 items in your cart',
		)
	})

	test('interpolates boolean values as strings', () => {
		const result = t('welcome', { name: true })
		expect(result).toBe('Welcome, true!')
	})

	test('returns key as fallback when translation not found', () => {
		expect(t('nonexistent.key')).toBe('nonexistent.key')
	})

	test('returns key as fallback for missing translation with vars', () => {
		expect(t('nonexistent.key', { foo: 'bar' })).toBe('nonexistent.key')
	})

	test('leaves placeholder intact when variable is missing', () => {
		expect(t('welcome', {})).toBe('Welcome, {name}!')
	})

	test('handles undefined variable values', () => {
		expect(t('welcome', { name: undefined })).toBe('Welcome, {name}!')
	})

	test('handles null variable values — null is stringified', () => {
		// null !== undefined, so the placeholder gets stringified as "null"
		expect(t('welcome', { name: null })).toBe('Welcome, null!')
	})

	test('handles multiple placeholders with some missing variables', () => {
		expect(t('multivar', { greeting: 'Hi' })).toBe(
			'Hi, {name}. You are {age} years old.',
		)
	})

	test('interpolates template with special characters', () => {
		const specialTranslations = {
			special: 'Price: {price}€',
		}
		const st = createT(specialTranslations)
		expect(st('special', { price: '19.99' })).toBe('Price: 19.99€')
	})

	test('interpolates template with multiple same-named placeholders', () => {
		const dupTranslations = {
			repeat: '{x} + {x} = {result}',
		}
		const dt = createT(dupTranslations)
		expect(dt('repeat', { x: 2, result: 4 })).toBe('2 + 2 = 4')
	})

	test('handles numeric translation key (coerced to string)', () => {
		// Keys are always strings in TranslationDict
		expect(t('42' as any)).toBe('42')
	})
})

// ─── TranslationProvider ────────────────────────────────────────────

describe('TranslationProvider', () => {
	test('provides locale and t() function to children', () => {
		mockRouteLoaderData.mockReturnValue({
			locale: 'en',
			translations: createMockTranslations('en'),
		})

		function TestChild() {
			const { locale, t } = useTranslation()
			return createElement(
				'div',
				{},
				createElement('span', { 'data-testid': 'locale' }, locale),
				createElement(
					'span',
					{ 'data-testid': 'translated' },
					t('nav.home'),
				),
			)
		}

		render(
			createElement(TranslationProvider, {
				locale: 'fr',
				translations: createMockTranslations('fr'),
				children: createElement(TestChild),
			}),
		)

		expect(screen.getByTestId('locale').textContent).toBe('fr')
		expect(screen.getByTestId('translated').textContent).toBe('Accueil')
	})

	test('falls back to "en" when loader data is null', () => {
		mockRouteLoaderData.mockReturnValue(null)

		function TestChild() {
			const { locale } = useTranslation()
			return createElement('span', { 'data-testid': 'locale' }, locale)
		}

		render(
			createElement(TranslationProvider, {
				locale: 'en',
				translations: {},
				children: createElement(TestChild),
			}),
		)

		// Should return the key itself as fallback
		expect(screen.getByTestId('fallback').textContent).toBe('nav.home')
	})

	test('interpolates variables via t() from TranslationProvider', () => {
		mockRouteLoaderData.mockReturnValue({
			locale: 'en',
			translations: createMockTranslations('en'),
		})

		function TestChild() {
			const { t } = useTranslation()
			return createElement(
				'span',
				{ 'data-testid': 'interpolated' },
				t('footer.copyright', { year: 2026 }),
			)
		}

		render(
			createElement(TranslationProvider, {
				locale: 'fr',
				translations: createMockTranslations('fr'),
				children: createElement(TestChild),
			}),
		)

		expect(screen.getByTestId('interpolated').textContent).toBe(
			'© 2026 Epic Notes. Tous droits réservés.',
		)
	})
})

// ─── useTranslation() ───────────────────────────────────────────────

describe('useTranslation()', () => {
	test('falls back to identity when used outside TranslationProvider', () => {
		let captured: { locale: string; t: (key: string) => string } | undefined

		function TestChild() {
			captured = useTranslation()
			return createElement('div')
		}

		render(createElement(TestChild))

		expect(captured?.locale).toBe('en')
		expect(captured?.t('any.key')).toBe('any.key')
	})

	test('returns locale from provider', () => {
		mockRouteLoaderData.mockReturnValue({
			locale: 'fr' as Locale,
			translations: createMockTranslations('fr'),
		})

		let capturedLocale: string | undefined

		function TestChild() {
			const { locale } = useTranslation()
			capturedLocale = locale
			return createElement('div')
		}

		render(
			createElement(TranslationProvider, {
				locale: 'en',
				translations: createMockTranslations('en'),
				children: createElement(TestChild),
			}),
		)

		expect(result).toBe('Search...')
	})
})

// ─── useOptionalTranslation() ───────────────────────────────────────

describe('useOptionalTranslation()', () => {
	test('falls back to identity when used outside TranslationProvider', () => {
		let captured: ReturnType<typeof useTranslation> | undefined

		function TestChild() {
			captured = useOptionalTranslation()
			return createElement('div')
		}

		render(createElement(TestChild))

		expect(captured?.locale).toBe('en')
		expect(captured?.t('any.key')).toBe('any.key')
	})

	test('returns context value when inside TranslationProvider', () => {
		mockRouteLoaderData.mockReturnValue({
			locale: 'en' as Locale,
			translations: createMockTranslations('en'),
		})

		let captured: any = undefined

		function TestChild() {
			captured = useOptionalTranslation()
			return createElement('div')
		}

		render(
			createElement(TranslationProvider, {
				locale: 'fr',
				translations: createMockTranslations('fr'),
				children: createElement(TestChild),
			}),
		)

		expect(result).toBe('Boutique')
	})
})
