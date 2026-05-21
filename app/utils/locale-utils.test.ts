/**
 * Unit tests for locale-aware utilities: price, date, address formatting.
 */
import { describe, expect, test } from 'vitest'
import { formatAddress, getCountryName } from './address.ts'
import { formatDate } from './date.ts'
import { formatPrice, centsToDollars, dollarsToCents } from './price.ts'

// ─── PRICE ──────────────────────────────────────────────────────────

describe('formatPrice', () => {
	const eur = { code: 'EUR', symbol: '€', decimals: 2 }
	const gbp = { code: 'GBP', symbol: '£', decimals: 2 }
	const usd = { code: 'USD', symbol: '$', decimals: 2 }

	test('FR locale formats EUR correctly', () => {
		const result = formatPrice(1234, eur, 'fr')
		// French: comma decimal, space + € (space may be regular or non-breaking)
		expect(result).toMatch(/12,34\s€/)
	})

	test('EN locale with EUR formats with € symbol', () => {
		const result = formatPrice(1234, eur, 'en')
		// en-GB with EUR: uses the EUR symbol, UK number formatting
		expect(result).toContain('€')
		expect(result.replace(/\s/g, ' ')).toMatch(/12\.34/)
	})

	test('EN locale with GBP formats correctly', () => {
		const result = formatPrice(1234, gbp, 'en')
		expect(result).toContain('£')
		expect(result).toContain('12.34')
	})

	test('EN locale with USD formats correctly', () => {
		const result = formatPrice(1234, usd, 'en')
		expect(result).toBe('US$12.34') // en-GB locale with USD uses US$ prefix
	})

	test('Backward-compatible: no locale, no currency', () => {
		const result = formatPrice(1234)
		expect(result).toBe('$12.34')
	})

	test('Backward-compatible: currency only, no locale', () => {
		const result = formatPrice(1234, usd)
		// With a valid currency code, uses Intl with en-GB default
		expect(result).toBe('US$12.34')
	})

	test('Backward-compatible: null currency, locale', () => {
		const result = formatPrice(1234, null, 'fr')
		expect(result).toBe('$12.34') // Falls back to symbol default
	})

	test('EUR with decimals=0', () => {
		const eur0 = { code: 'EUR', symbol: '€', decimals: 0 }
		const result = formatPrice(1200, eur0, 'fr')
		expect(result).toMatch(/12\s€/) // No decimal digits, 12 then space then €
	})

	test('Large amount formatting', () => {
		const result = formatPrice(123456789, usd, 'en')
		expect(result).toContain('1,234,567')
	})

	test('Zero price', () => {
		const result = formatPrice(0, eur, 'fr')
		expect(result).toContain('0,00')
	})

	test('Invalid currency code displays as-is', () => {
		const bad = { code: 'XYZ', symbol: 'X', decimals: 2 }
		// Intl.NumberFormat renders unknown currency codes as-is: "12,34 XYZ"
		const result = formatPrice(1234, bad, 'fr')
		expect(result).toMatch(/12,34/)
		expect(result).toContain('XYZ')
	})
})

// ─── CENTS/DOLLARS ──────────────────────────────────────────────────

describe('centsToDollars', () => {
	test('converts cents to dollars', () => {
		expect(centsToDollars(1234)).toBe(12.34)
		expect(centsToDollars(0)).toBe(0)
		expect(centsToDollars(99)).toBe(0.99)
	})
})

describe('dollarsToCents', () => {
	test('converts dollars to cents', () => {
		expect(dollarsToCents(12.34)).toBe(1234)
		expect(dollarsToCents(0)).toBe(0)
		expect(dollarsToCents(12.345)).toBe(1235) // rounding
	})
})

// ─── DATE ───────────────────────────────────────────────────────────

describe('formatDate', () => {
	const testDate = new Date('2026-03-21T14:30:00Z')

	test('FR locale with medium style (default)', () => {
		const result = formatDate(testDate, 'fr')
		// "21 mars 2026" — French medium format
		expect(result).toContain('mars')
		expect(result).toContain('2026')
	})

	test('FR locale with short format', () => {
		const result = formatDate(testDate, 'fr', { format: 'short' })
		expect(result).toBe('21/03/2026')
	})

	test('EN locale with medium style (default)', () => {
		const result = formatDate(testDate, 'en')
		// "21 Mar 2026" — UK medium format
		expect(result).toContain('Mar')
		expect(result).toContain('2026')
	})

	test('EN locale with full style', () => {
		const result = formatDate(testDate, 'en', { dateStyle: 'full', timeStyle: 'short' })
		expect(result).toContain('Saturday')
		expect(result).toContain('March')
	})

	test('Accepts ISO string input', () => {
		const result = formatDate('2026-03-21T14:30:00Z', 'fr', { format: 'short' })
		expect(result).toBe('21/03/2026')
	})

	test('Accepts timestamp input', () => {
		const ts = testDate.getTime()
		const result = formatDate(ts, 'fr', { format: 'short' })
		expect(result).toBe('21/03/2026')
	})

	test('Invalid date returns string representation', () => {
		const result = formatDate('not-a-date', 'fr')
		expect(result).toBe('not-a-date')
	})

	test('Null/undefined locale defaults to en', () => {
		const result = formatDate(testDate, null)
		expect(result).toContain('2026')
	})

	test('Custom dateStyle and timeStyle', () => {
		const result = formatDate(testDate, 'fr', { dateStyle: 'medium', timeStyle: 'short' })
		expect(result).toContain('2026')
		expect(result).toContain(':') // Has time component
	})
})

// ─── ADDRESS ────────────────────────────────────────────────────────

describe('formatAddress', () => {
	const frAddress = {
		name: 'Marie Dupont',
		street: '1 rue de Paris',
		city: 'Paris',
		postal: '75001',
		country: 'FR',
	}

	const usAddress = {
		name: 'John Smith',
		street: '123 Main St',
		city: 'New York',
		state: 'NY',
		postal: '10001',
		country: 'US',
	}

	const itAddress = {
		name: 'Marco Rossi',
		street: 'Via Roma 42',
		city: 'Milano',
		state: 'MI',
		postal: '20121',
		country: 'IT',
	}

	test('FR address — eu-standard layout', () => {
		const result = formatAddress(frAddress)
		expect(result.lines).toHaveLength(4)
		expect(result.lines[0]).toBe('Marie Dupont')
		expect(result.lines[1]).toBe('1 rue de Paris')
		expect(result.lines[2]).toBe('75001 PARIS')
		expect(result.lines[3]).toBe('FR')
	})

	test('FR address inline', () => {
		const result = formatAddress(frAddress)
		expect(result.inline).toContain('Marie Dupont')
		expect(result.inline).toContain('1 rue de Paris')
		expect(result.inline).toContain('75001 PARIS')
		expect(result.inline).toContain('·')
	})

	test('US address — us-standard layout', () => {
		const result = formatAddress(usAddress)
		expect(result.lines).toHaveLength(4)
		expect(result.lines[2]).toBe('New York, NY 10001')
		expect(result.lines[3]).toBe('US')
	})

	test('IT address — with-province layout', () => {
		const result = formatAddress(itAddress)
		expect(result.lines).toHaveLength(4)
		expect(result.lines[2]).toBe('20121 MILANO (MI)')
	})

	test('DE address — eu-standard layout', () => {
		const deAddr = {
			name: 'Hans Müller',
			street: 'Hauptstraße 1',
			city: 'Berlin',
			postal: '10115',
			country: 'DE',
		}
		const result = formatAddress(deAddr)
		expect(result.lines[2]).toBe('10115 BERLIN')
		expect(result.lines[3]).toBe('DE')
	})

	test('NL address — eu-standard layout', () => {
		const nlAddr = {
			name: 'Jan de Vries',
			street: 'Kalverstraat 1',
			city: 'Amsterdam',
			postal: '1012 NX',
			country: 'NL',
		}
		const result = formatAddress(nlAddr)
		expect(result.lines[2]).toBe('1012 NX AMSTERDAM')
	})

	test('Country override parameter works', () => {
		const result = formatAddress(frAddress, 'US')
		expect(result.lines[2]).toBe('Paris 75001') // US format: city postal
	})

	test('Unknown country defaults to us-standard', () => {
		const jpAddr = { ...frAddress, country: 'JP' }
		const result = formatAddress(jpAddr)
		expect(result.lines[2]).toBe('Paris 75001') // city postal (US default)
	})

	test('Empty state is handled', () => {
		const result = formatAddress(usAddress, 'US')
		// With state
		expect(result.lines[2]).toBe('New York, NY 10001')
		
		const noState = { ...usAddress, state: null }
		const result2 = formatAddress(noState, 'US')
		expect(result2.lines[2]).toBe('New York 10001')
	})

	test('Parts exclude country line', () => {
		const result = formatAddress(frAddress)
		expect(result.parts).toHaveLength(3) // name, street, postal+city (no country)
		expect(result.parts[2]).toBe('75001 PARIS')
	})
})

describe('getCountryName', () => {
	test('returns full country name from ISO code', () => {
		expect(getCountryName('FR')).toBe('France')
		expect(getCountryName('DE')).toBe('Germany')
		expect(getCountryName('IT')).toBe('Italy')
		expect(getCountryName('ES')).toBe('Spain')
		expect(getCountryName('BE')).toBe('Belgium')
		expect(getCountryName('NL')).toBe('Netherlands')
	})

	test('returns code as-is for unknown countries', () => {
		expect(getCountryName('JP')).toBe('JP')
	})
})
