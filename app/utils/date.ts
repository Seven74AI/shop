import { type Locale } from './i18n.server.ts'

/**
 * Map short locale code to full locale for Intl APIs.
 * 'fr' → 'fr-FR', 'en' → 'en-GB'
 */
function localeToIntl(locale: Locale): string {
	return locale === 'fr' ? 'fr-FR' : 'en-GB'
}

export interface FormatDateOptions {
	/** Date style: 'full' | 'long' | 'medium' | 'short' (default: 'medium') */
	dateStyle?: Intl.DateTimeFormatOptions['dateStyle']
	/** Time style: 'full' | 'long' | 'medium' | 'short' (default: none — date only) */
	timeStyle?: Intl.DateTimeFormatOptions['timeStyle']
	/** Custom format: 'short' = just the date, 'long' = date + time */
	format?: 'short' | 'long' | 'full'
}

/**
 * Format a date using `Intl.DateTimeFormat` for locale-aware display.
 *
 * @param date   A Date object, timestamp (number), or ISO string
 * @param locale The locale to format for (defaults to 'en')
 * @param opts   Formatting options
 * @returns Formatted date string
 *
 * @example
 *   formatDate(new Date('2026-03-21'), 'fr')                     // "21 mars 2026"
 *   formatDate(new Date('2026-03-21'), 'fr', { format: 'short' }) // "21/03/2026"
 *   formatDate(new Date(), 'en', { dateStyle: 'full' })           // "Saturday, 21 March 2026"
 *   formatDate(new Date(), 'fr', { timeStyle: 'short', dateStyle: 'medium' }) // "21 mars 2026 à 14:30"
 */
export function formatDate(
	date: Date | number | string,
	locale?: Locale | null,
	opts?: FormatDateOptions
): string {
	const intlLocale = localeToIntl(locale ?? 'en')
	const d = date instanceof Date ? date : new Date(date)

	// If invalid date, return the input as string
	if (isNaN(d.getTime())) {
		return String(date)
	}

	let options: Intl.DateTimeFormatOptions = {}

	if (opts?.dateStyle || opts?.timeStyle) {
		options = {
			dateStyle: opts.dateStyle ?? 'medium',
			timeStyle: opts.timeStyle,
		}
	} else {
		switch (opts?.format) {
			case 'short':
				// Short numeric: 21/03/2026 (fr) or 21/03/2026 (en-GB)
				options = {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
				}
				break
			case 'full':
				// Full date + time
				options = {
					dateStyle: 'full',
					timeStyle: 'short',
				}
				break
			case 'long':
			default:
				// Medium date (default): 21 Mar 2026 / 21 mars 2026
				options = { dateStyle: 'medium' }
				break
		}
	}

	return new Intl.DateTimeFormat(intlLocale, options).format(d)
}
