import * as React from 'react'
import { useRouteLoaderData } from 'react-router'
import { type loader as rootLoader } from '#app/root.tsx'
import { type Locale } from './i18n.server.js'

type TranslationDict = Record<string, string>

interface I18nContextValue {
	locale: Locale
	t: (key: string, vars?: Record<string, unknown>) => string
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

/**
 * Simple ICU-light interpolation:
 * `t("greeting", { name: "Marie" })` → reads `"greeting": "Bonjour {name}"`
 */
function interpolate(template: string, vars: Record<string, unknown>): string {
	return template.replace(/\{(\w+)\}/g, (_, key: string) => {
		return vars[key] !== undefined ? String(vars[key]) : `{${key}}`
	})
}

/**
 * Translate a key using the current locale's translation dictionary.
 * Returns the key itself as fallback if no translation is found.
 */
function createT(
	translations: TranslationDict,
	locale: Locale,
): (key: string, vars?: Record<string, unknown>) => string {
	return (key: string, vars?: Record<string, unknown>): string => {
		const template = translations[key]
		if (!template) {
			// Return key as fallback — helpful during development and for missing keys
			if (process.env.NODE_ENV === 'development') {
				console.warn(
					`[i18n] Missing translation for key "${key}" in locale "${locale}"`,
				)
			}
			return key
		}
		if (vars) {
			return interpolate(template, vars)
		}
		return template
	}
}

/**
 * Provide locale and translations to all descendants via React context.
 */
export function TranslationProvider({
	children,
}: {
	children: React.ReactNode
}) {
	const data = useRouteLoaderData<typeof rootLoader>('root')
	const locale: Locale = (data?.locale as Locale) ?? 'en'
	const translations: TranslationDict = React.useMemo(
		() => (data?.translations as TranslationDict) ?? {},
		[data?.translations],
	)

	const t = React.useMemo(
		() => createT(translations, locale),
		[translations, locale],
	)

	const value = React.useMemo<I18nContextValue>(
		() => ({ locale, t }),
		[locale, t],
	)

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Hook to access the current locale and the `t()` translation function.
 *
 * Usage:
 * ```tsx
 * const { t, locale } = useTranslation()
 * return <h1>{t('site.title')}</h1>
 * ```
 */
export function useTranslation(): I18nContextValue {
	const ctx = React.useContext(I18nContext)
	if (!ctx) {
		throw new Error(
			'useTranslation() must be used within a <TranslationProvider>. ' +
				'Wrap your app in root.tsx with <TranslationProvider>.',
		)
	}
	return ctx
}

/**
 * Optional hook — returns null if no TranslationProvider is in the tree.
 * Useful in error boundaries or shared components that may render outside the provider.
 */
export function useOptionalTranslation(): I18nContextValue | null {
	return React.useContext(I18nContext)
}
