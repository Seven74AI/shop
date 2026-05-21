import { createContext, useContext } from 'react'
import type { Locale } from './i18n.server.ts'

interface I18nContextValue {
	locale: Locale
	t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

/**
 * Provides translations to the React component tree.
 * Wrap your layout/root component with this.
 */
export function TranslationProvider({
	children,
	locale,
	translations,
}: {
	children: React.ReactNode
	locale: Locale
	translations: Record<string, string>
}) {
	const t = (key: string, params?: Record<string, string | number>) => {
		let value = translations[key] ?? key
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				value = value.replace(`{${k}}`, String(v))
			}
		}
		return value
	}

	return (
		<I18nContext.Provider value={{ locale, t }}>
			{children}
		</I18nContext.Provider>
	)
}

/**
 * React hook for accessing translations in components.
 * Falls back to returning the key as-is if no TranslationProvider is found.
 */
export function useTranslation(): I18nContextValue {
	const ctx = useContext(I18nContext)
	if (!ctx) {
		return {
			locale: 'en' as Locale,
			t: (key: string) => key,
		}
	}
	return ctx
}

/**
 * Creates a standalone `t()` function for use outside React components
 * (e.g., email templates, server-side string formatting).
 */
export function createT(translations: Record<string, string>) {
	return (key: string, params?: Record<string, string | number>) => {
		let value = translations[key] ?? key
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				value = value.replace(`{${k}}`, String(v))
			}
		}
		return value
	}
}

/**
 * Safe version of useTranslation() that falls back to identity function.
 * Use in components that may render outside a TranslationProvider.
 * Re-exported here for convenience; primary export is via misc.tsx.
 */
export function useOptionalTranslation(): I18nContextValue {
	return useTranslation()
}
