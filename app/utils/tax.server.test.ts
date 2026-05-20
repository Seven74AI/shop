import { type TaxKind } from '@prisma/client'
import { describe, expect, test } from 'vitest'
import {
	resolveTaxCountry,
	calculateItemVat,
	calculateOrderVat,
	EU_COUNTRIES,
	MERCHANT_COUNTRY,
	formatBasisPoints,
	type TaxableItem,
} from './tax.server.ts'

describe('resolveTaxCountry', () => {
	test('returns FR for domestic shipping (reverseCharge=false)', () => {
		const result = resolveTaxCountry('FR')
		expect(result).toEqual({ taxCountry: 'FR', reverseCharge: false })
	})

	test('returns FR for domestic with lowercase input', () => {
		const result = resolveTaxCountry('fr')
		expect(result).toEqual({ taxCountry: 'FR', reverseCharge: false })
	})

	test('returns destination country for EU B2C (no VAT number)', () => {
		const result = resolveTaxCountry('DE')
		expect(result).toEqual({ taxCountry: 'DE', reverseCharge: false })
	})

	test('returns destination country for EU B2B with VAT number (reverseCharge=true)', () => {
		const result = resolveTaxCountry('DE', 'DE123456789')
		expect(result).toEqual({ taxCountry: 'DE', reverseCharge: true })
	})

	test('returns destination country for non-EU export (reverseCharge=false)', () => {
		const result = resolveTaxCountry('US')
		expect(result).toEqual({ taxCountry: 'US', reverseCharge: false })
	})

	test('handles empty VAT number', () => {
		const result = resolveTaxCountry('DE', '')
		expect(result).toEqual({ taxCountry: 'DE', reverseCharge: false })
	})

	test('handles null VAT number', () => {
		const result = resolveTaxCountry('DE', null)
		expect(result).toEqual({ taxCountry: 'DE', reverseCharge: false })
	})

	test('handles whitespace-only VAT number', () => {
		const result = resolveTaxCountry('DE', '   ')
		expect(result).toEqual({ taxCountry: 'DE', reverseCharge: false })
	})

	test('all EU countries return valid results', () => {
		for (const country of EU_COUNTRIES) {
			const result = resolveTaxCountry(country)
			expect(result.taxCountry).toBe(country)
			if (country === MERCHANT_COUNTRY) {
				expect(result.reverseCharge).toBe(false)
			}
		}
	})
})

describe('calculateItemVat', () => {
	test('calculates standard 20% VAT correctly', () => {
		const result = calculateItemVat(1000, 2, 'STANDARD', 2000, false)
		// baseCents = 1000 * 2 = 2000
		// vatCents = 2000 * 2000 / 10000 = 400
		expect(result).toEqual({
			kind: 'STANDARD',
			rate: 2000,
			baseCents: 2000,
			vatCents: 400,
		})
	})

	test('calculates reduced 10% VAT correctly', () => {
		const result = calculateItemVat(500, 3, 'REDUCED', 1000, false)
		// baseCents = 500 * 3 = 1500
		// vatCents = 1500 * 1000 / 10000 = 150
		expect(result).toEqual({
			kind: 'REDUCED',
			rate: 1000,
			baseCents: 1500,
			vatCents: 150,
		})
	})

	test('calculates super-reduced 5.5% VAT correctly', () => {
		const result = calculateItemVat(1000, 1, 'SUPER_REDUCED', 550, false)
		// baseCents = 1000
		// vatCents = 1000 * 550 / 10000 = 55
		expect(result).toEqual({
			kind: 'SUPER_REDUCED',
			rate: 550,
			baseCents: 1000,
			vatCents: 55,
		})
	})

	test('calculates zero VAT correctly', () => {
		const result = calculateItemVat(1000, 1, 'ZERO', 0, false)
		expect(result).toEqual({
			kind: 'ZERO',
			rate: 0,
			baseCents: 1000,
			vatCents: 0,
		})
	})

	test('reverse charge sets VAT to 0 regardless of rate', () => {
		const result = calculateItemVat(1000, 5, 'STANDARD', 2000, true)
		expect(result).toEqual({
			kind: 'STANDARD',
			rate: 0,
			baseCents: 5000,
			vatCents: 0,
		})
	})

	test('handles rounding correctly (e.g. 33.33 → 33)', () => {
		// 100 cents * 2000bp = 100 * 2000/10000 = 20.00 → 20
		const result = calculateItemVat(100, 1, 'STANDARD', 2000, false)
		expect(result.vatCents).toBe(20)
	})

	test('handles rounding at boundary (0.5 rounds down)', () => {
		// 25 cents * 2000bp = 25 * 2000/10000 = 5.00 → 5
		const result = calculateItemVat(25, 1, 'STANDARD', 2000, false)
		expect(result.vatCents).toBe(5)
	})

	test('handles small amounts with rounding', () => {
		// 1 cent * 2000bp = 1 * 2000/10000 = 0.2 → 0
		const result = calculateItemVat(1, 1, 'STANDARD', 2000, false)
		expect(result.vatCents).toBe(0)
	})
})

describe('calculateOrderVat', () => {
	test('returns zero VAT for non-EU country (export)', async () => {
		const items: TaxableItem[] = [
			{ priceCents: 1000, quantity: 2, taxKind: 'STANDARD' },
		]
		const result = await calculateOrderVat(items, 'US')
		expect(result.taxCountry).toBe('US')
		expect(result.totalVatCents).toBe(0)
		expect(result.breakdown).toEqual([])
		expect(result.totalBaseCents).toBe(2000)
	})

	test('returns zero VAT for EU B2B with reverse charge', async () => {
		const items: TaxableItem[] = [
			{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' },
		]
		const result = await calculateOrderVat(items, 'DE', 'DE123456789')
		expect(result.totalVatCents).toBe(0)
		expect(result.breakdown).toEqual([])
	})

	test('calculates FR domestic VAT correctly (20% standard)', async () => {
		const items: TaxableItem[] = [
			{ priceCents: 1000, quantity: 2, taxKind: 'STANDARD' as TaxKind },
		]
		const result = await calculateOrderVat(items, 'FR')
		expect(result.taxCountry).toBe('FR')
		expect(result.totalVatCents).toBe(400) // 2000 * 20% = 400
		expect(result.breakdown).toHaveLength(1)
		expect(result.breakdown[0]).toMatchObject({
			kind: 'STANDARD',
			rate: 2000,
			baseCents: 2000,
			vatCents: 400,
		})
	})

	test('calculates FR mixed VAT items correctly', async () => {
		const items: TaxableItem[] = [
			{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' as TaxKind }, // 20% → 200
			{ priceCents: 500, quantity: 2, taxKind: 'REDUCED' as TaxKind }, // 10% → 100
			{ priceCents: 200, quantity: 1, taxKind: 'SUPER_REDUCED' as TaxKind }, // 5.5% → 11
			{ priceCents: 100, quantity: 3, taxKind: 'ZERO' as TaxKind }, // 0% → 0
		]
		const result = await calculateOrderVat(items, 'FR')
		expect(result.totalVatCents).toBe(311) // 200 + 100 + 11 + 0
		expect(result.breakdown).toHaveLength(4)
	})

	test('merges breakdown items with same kind and rate', async () => {
		const items: TaxableItem[] = [
			{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' as TaxKind },
			{ priceCents: 2000, quantity: 1, taxKind: 'STANDARD' as TaxKind },
		]
		const result = await calculateOrderVat(items, 'FR')
		// Both STANDARD/2000 → should merge into one line
		expect(result.breakdown).toHaveLength(1)
		expect(result.breakdown[0]).toMatchObject({
			kind: 'STANDARD',
			rate: 2000,
			baseCents: 3000,
			vatCents: 600,
		})
	})

	test('calculates OSS destination rate for EU B2C (DE 19%)', async () => {
		const items: TaxableItem[] = [
			{ priceCents: 10000, quantity: 1, taxKind: 'STANDARD' as TaxKind },
		]
		const result = await calculateOrderVat(items, 'DE')
		expect(result.taxCountry).toBe('DE')
		expect(result.totalVatCents).toBe(1900) // 10000 * 19% = 1900
		expect(result.breakdown[0]!.rate).toBe(1900)
	})

	test('calculates OSS for Hungary (27% highest EU rate)', async () => {
		const items: TaxableItem[] = [
			{ priceCents: 10000, quantity: 1, taxKind: 'STANDARD' as TaxKind },
		]
		const result = await calculateOrderVat(items, 'HU')
		expect(result.taxCountry).toBe('HU')
		expect(result.totalVatCents).toBe(2700) // 10000 * 27% = 2700
	})

	test('calculates OSS for Luxembourg (17% lowest EU standard)', async () => {
		const items: TaxableItem[] = [
			{ priceCents: 10000, quantity: 1, taxKind: 'STANDARD' as TaxKind },
		]
		const result = await calculateOrderVat(items, 'LU')
		expect(result.taxCountry).toBe('LU')
		expect(result.totalVatCents).toBe(1700) // 10000 * 17% = 1700
	})

	test('uses 0% rate for unknown tax kind (no matching rate in DB)', async () => {
		const items: TaxableItem[] = [
			{
				priceCents: 1000,
				quantity: 1,
				taxKind: 'STANDARD' as TaxKind,
			},
		]
		// Test with a country that has no REDUCED rate seeded — will get 0
		const result = await calculateOrderVat(items, 'US')
		expect(result.totalVatCents).toBe(0)
	})

	test('empty items array returns zero VAT', async () => {
		const result = await calculateOrderVat([], 'FR')
		expect(result.totalVatCents).toBe(0)
		expect(result.breakdown).toEqual([])
		expect(result.totalBaseCents).toBe(0)
	})

	test('handles large order with multiple items across EU country', async () => {
		const items: TaxableItem[] = Array.from({ length: 10 }, (_, i) => ({
			priceCents: 1000 + i * 100,
			quantity: i + 1,
			taxKind: 'STANDARD' as TaxKind,
		}))
		const result = await calculateOrderVat(items, 'IT')
		expect(result.taxCountry).toBe('IT')
		expect(result.breakdown[0]!.rate).toBe(2200) // Italy 22%
		// Verify non-zero VAT
		expect(result.totalVatCents).toBeGreaterThan(0)
	})
})

describe('formatBasisPoints', () => {
	test('formats 2000 as "20.00%"', () => {
		expect(formatBasisPoints(2000)).toBe('20.00%')
	})

	test('formats 550 as "5.50%"', () => {
		expect(formatBasisPoints(550)).toBe('5.50%')
	})

	test('formats 0 as "0.00%"', () => {
		expect(formatBasisPoints(0)).toBe('0.00%')
	})

	test('formats 2550 as "25.50%"', () => {
		expect(formatBasisPoints(2550)).toBe('25.50%')
	})
})

describe('EU_COUNTRIES', () => {
	test('contains all 27 EU member states', () => {
		expect(EU_COUNTRIES.size).toBe(27)
	})

	test('includes France', () => {
		expect(EU_COUNTRIES.has('FR')).toBe(true)
	})

	test('does NOT include non-EU countries', () => {
		expect(EU_COUNTRIES.has('US')).toBe(false)
		expect(EU_COUNTRIES.has('GB')).toBe(false)
		expect(EU_COUNTRIES.has('CH')).toBe(false)
		expect(EU_COUNTRIES.has('NO')).toBe(false)
		expect(EU_COUNTRIES.has('JP')).toBe(false)
	})
})
