<<<<<<< HEAD
import * as React from 'react'
import { useRouteLoaderData } from 'react-router'
import { type loader as rootLoader } from '#app/root.tsx'
import { type Locale, type TranslationDict } from './i18n.server.ts'

type I18nContextValue = {
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
 * Create a t() function scoped to a translations dictionary.
 * Returns the key itself as fallback if no translation is found.
 */
function createT(
	translations: TranslationDict,
	locale: Locale,
): (key: string, vars?: Record<string, unknown>) => string {
	return (key: string, vars?: Record<string, unknown>): string => {
		const template = translations[key]
		if (!template) {
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
=======
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
>>>>>>> feat/t_bbce3b
	}
	return ctx
}

/**
<<<<<<< HEAD
 * Optional hook — returns null if no TranslationProvider is in the tree.
 * Useful in error boundaries or shared components that may render outside the provider.
 */
export function useOptionalTranslation(): I18nContextValue | null {
	return React.useContext(I18nContext)
=======
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
>>>>>>> feat/t_bbce3b
}
