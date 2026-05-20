import { type Locale } from './i18n.server.ts'

export type Currency = {
	code: string // e.g., 'USD', 'EUR', 'GBP'
	symbol: string
	decimals: number
}

/**
 * Map short locale code to full locale for Intl APIs.
 *
 * 'fr' → 'fr-FR' (French formatting: 12,34 €)
 * 'en' → 'en-GB'  (UK formatting: £12.34)
 */
function localeToIntl(locale: Locale): string {
	return locale === 'fr' ? 'fr-FR' : 'en-GB'
}

/**
 * Formats a price in cents as a locale-aware currency amount.
 *
 * Backward-compatible signature:
 *   formatPrice(priceInCents)                        // $12.34 (en, USD)
 *   formatPrice(priceInCents, currency)               // $12.34 (en, with currency object)
 *   formatPrice(priceInCents, currency, locale)       // locale-aware with currency
 *
 * @param priceInCents The price in cents (e.g., 1234 → 12.34)
 * @param currency     Optional currency object with code (ISO 4217), symbol, decimals.
 *                     Pass null to use defaults.
 * @param locale       Optional locale for number formatting (defaults to 'en')
 * @returns Formatted price string (e.g., "12,34 €" for fr, "£12.34" for en with GBP)
 *
 * @example
 *   formatPrice(1234, { code: 'EUR', symbol: '€', decimals: 2 }, 'fr') // "12,34 €"
 *   formatPrice(1234, { code: 'GBP', symbol: '£', decimals: 2 }, 'en') // "£12.34"
 *   formatPrice(1234, { code: 'USD', symbol: '$', decimals: 2 })       // "$12.34"
 */
export function formatPrice(
	priceInCents: number,
	currency?: Currency | null,
	locale?: Locale | null
): string {
	const intlLocale = localeToIntl(locale ?? 'en')

	if (currency?.code) {
		try {
			return new Intl.NumberFormat(intlLocale, {
				style: 'currency',
				currency: currency.code,
				minimumFractionDigits: currency.decimals ?? 2,
				maximumFractionDigits: currency.decimals ?? 2,
			}).format(priceInCents / 100)
		} catch {
			// Fall through to symbol-based fallback if currency code is invalid
		}
	}

	// Fallback: use symbol + manual formatting (backward-compatible)
	const symbol = currency?.symbol ?? '$'
	const decimals = currency?.decimals ?? 2
	return `${symbol}${(priceInCents / 100).toFixed(decimals)}`
}

/**
 * Converts a price from cents to dollars
 * @param priceInCents The price in cents
 * @returns The price in dollars
 */
export function centsToDollars(priceInCents: number): number {
	return priceInCents / 100
}

/**
 * Converts a price from dollars to cents
 * @param priceInDollars The price in dollars
 * @returns The price in cents
 */
export function dollarsToCents(priceInDollars: number): number {
	return Math.round(priceInDollars * 100)
}
