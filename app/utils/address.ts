/**
 * Address formatting utilities — locale-aware country-specific layout.
 *
 * Each country formats postal addresses differently. This module provides a
 * small registry that maps country ISO codes to layout templates.
 *
 * Countries covered: FR, DE, IT, ES, BE, NL (EU minimum) + EN/US fallback.
 */

/**
 * Address shape — matches the denormalized shipping fields on Order.
 */
export interface AddressFields {
	name: string
	street: string
	city: string
	state?: string | null
	postal: string
	country: string // ISO 3166-1 alpha-2 (e.g., 'FR', 'DE')
}

/**
 * Address format order for each country.
 *
 * FR:  NAME / STREET / POSTAL CITY / COUNTRY
 * DE:  NAME / STREET / POSTAL CITY / COUNTRY
 * IT:  NAME / STREET / POSTAL CITY (PROVINCE) / COUNTRY
 * ES:  NAME / STREET / POSTAL CITY (PROVINCE) / COUNTRY
 * BE:  NAME / STREET / POSTAL CITY / COUNTRY
 * NL:  NAME / STREET / POSTAL CITY / COUNTRY
 * EN (fallback): NAME / STREET / CITY STATE POSTAL / COUNTRY
 */

type CountryLayout = 'eu-standard' | 'with-province' | 'us-standard'

const COUNTRY_LAYOUTS: Record<string, CountryLayout> = {
	FR: 'eu-standard',
	DE: 'eu-standard',
	BE: 'eu-standard',
	NL: 'eu-standard',
	IT: 'with-province',
	ES: 'with-province',
	// Default: us-standard
}

interface FormattedAddress {
	/** Single-line display (e.g., for receipts) */
	inline: string
	/** Array of lines for multi-line rendering */
	lines: string[]
	/** Full formatted address as TSX-friendly fragments */
	parts: string[]
}

/**
 * Format an address according to the country's postal conventions.
 *
 * @param address The address fields
 * @param country Optional country code override (defaults to address.country)
 * @returns Formatted address with inline, lines, and parts
 *
 * @example
 *   formatAddress({ name: 'Marie', street: '1 rue de Paris', city: 'Paris', postal: '75001', country: 'FR' })
 *   // { inline: 'Marie · 1 rue de Paris · 75001 PARIS · FRANCE', lines: [...], parts: [...] }
 */
export function formatAddress(
	address: AddressFields,
	country?: string | null
): FormattedAddress {
	const cc = (country ?? address.country ?? '').toUpperCase()
	const layout = COUNTRY_LAYOUTS[cc] ?? 'us-standard'

	const state = address.state || null

	// Build lines per country layout
	const lines: string[] = []
	lines.push(address.name)
	lines.push(address.street)

	switch (layout) {
		case 'eu-standard':
			// POSTAL CITY
			lines.push(`${address.postal} ${address.city.toUpperCase()}`)
			break
		case 'with-province':
			// POSTAL CITY (PROVINCE)
			if (state) {
				lines.push(
					`${address.postal} ${address.city.toUpperCase()} (${state.toUpperCase()})`
				)
			} else {
				lines.push(`${address.postal} ${address.city.toUpperCase()}`)
			}
			break
		case 'us-standard':
		default:
			// CITY STATE POSTAL
			if (state) {
				lines.push(`${address.city}, ${state} ${address.postal}`)
			} else {
				lines.push(`${address.city} ${address.postal}`)
			}
			break
	}

	// Country line (uppercase)
	if (cc) {
		lines.push(cc)
	}

	// Parts: same as lines but without trailing country (for inline use with country separate)
	const parts = [...lines]
	const countryLine = parts.pop() // remove country from parts

	const inline = [...parts, countryLine].filter(Boolean).join(' · ')

	return { inline, lines, parts }
}

/**
 * Get a country display name from its ISO code.
 * Minimal lookup for the supported countries.
 */
const COUNTRY_NAMES: Record<string, string> = {
	FR: 'France',
	DE: 'Germany',
	IT: 'Italy',
	ES: 'Spain',
	BE: 'Belgium',
	NL: 'Netherlands',
	US: 'United States',
	GB: 'United Kingdom',
}

export function getCountryName(code: string): string {
	return COUNTRY_NAMES[code.toUpperCase()] ?? code
}
