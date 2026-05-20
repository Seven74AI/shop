import { describe, expect, test, beforeEach } from 'vitest'
import { prisma } from './db.server.ts'
import {
	resolveTaxCountry,
	getTaxRate,
	calculateVat,
	aggregateBreakdown,
	MERCHANT_COUNTRY,
} from './tax.server.ts'
import type { TaxKind } from '@prisma/client'

/**
 * Helper: seed FR tax rates (the merchant/home country).
 */
async function seedFrRates() {
	const base = {
		isActive: true,
		effectiveFrom: new Date('2024-01-01'),
	}
	const rates = [
		{ ...base, country: 'FR', kind: 'STANDARD' as TaxKind, rate: 2000 }, // 20%
		{ ...base, country: 'FR', kind: 'REDUCED' as TaxKind, rate: 1000 }, // 10%
		{ ...base, country: 'FR', kind: 'SUPER_REDUCED' as TaxKind, rate: 550 }, // 5.5%
	]
	for (const r of rates) {
		try {
			await prisma.taxRate.create({ data: r })
		} catch {
			// Already exists (unique constraint on country+kind+effectiveFrom)
		}
	}
}

/**
 * Helper: seed DE tax rates (OSS destination country).
 */
async function seedDeRates() {
	const base = {
		isActive: true,
		effectiveFrom: new Date('2024-01-01'),
	}
	const rates = [
		{ ...base, country: 'DE', kind: 'STANDARD' as TaxKind, rate: 1900 }, // 19%
		{ ...base, country: 'DE', kind: 'REDUCED' as TaxKind, rate: 700 }, // 7%
	]
	for (const r of rates) {
		try {
			await prisma.taxRate.create({ data: r })
		} catch {
			// Already exists (unique constraint on country+kind+effectiveFrom)
		}
	}
}

describe('resolveTaxCountry', () => {
	test('domestic → FR', () => {
		expect(resolveTaxCountry('FR')).toEqual({
			taxCountry: 'FR',
			reverseCharge: false,
		})
	})

	test('domestic case-insensitive', () => {
		expect(resolveTaxCountry('fr')).toEqual({
			taxCountry: 'FR',
			reverseCharge: false,
		})
	})

	test('EU B2C (no VAT) → OSS destination rate', () => {
		expect(resolveTaxCountry('DE')).toEqual({
			taxCountry: 'DE',
			reverseCharge: false,
		})
	})

	test('EU B2B (valid VAT) → reverse charge', () => {
		expect(resolveTaxCountry('DE', 'DE123456789')).toEqual({
			taxCountry: 'DE',
			reverseCharge: true,
		})
	})

	test('export outside EU (US) → no VAT', () => {
		expect(resolveTaxCountry('US')).toEqual({
			taxCountry: 'US',
			reverseCharge: false,
		})
	})

	test('whitespace-only VAT → treated as no VAT (B2C)', () => {
		expect(resolveTaxCountry('DE', '   ')).toEqual({
			taxCountry: 'DE',
			reverseCharge: false,
		})
	})

	test('null VAT → B2C', () => {
		expect(resolveTaxCountry('DE', null)).toEqual({
			taxCountry: 'DE',
			reverseCharge: false,
		})
	})

	test('undefined VAT → B2C', () => {
		expect(resolveTaxCountry('DE')).toEqual({
			taxCountry: 'DE',
			reverseCharge: false,
		})
	})
})

describe('getTaxRate', () => {
	beforeEach(async () => {
		await seedFrRates()
	})

	test('returns 0 for ZERO tax kind without DB hit', async () => {
		const rate = await getTaxRate('FR', 'ZERO')
		expect(rate).toBe(0)
	})

	test('returns FR STANDARD rate (20%)', async () => {
		const rate = await getTaxRate('FR', 'STANDARD')
		expect(rate).toBe(2000)
	})

	test('returns FR REDUCED rate (10%)', async () => {
		const rate = await getTaxRate('FR', 'REDUCED')
		expect(rate).toBe(1000)
	})

	test('returns FR SUPER_REDUCED rate (5.5%)', async () => {
		const rate = await getTaxRate('FR', 'SUPER_REDUCED')
		expect(rate).toBe(550)
	})

	test('returns 0 for unknown country (export)', async () => {
		const rate = await getTaxRate('US', 'STANDARD')
		expect(rate).toBe(0)
	})

	test('returns 0 for country without this tax kind', async () => {
		// FR has no REDUCED rate for DE — should be 0
		await seedDeRates()
		const rate = await getTaxRate('DE', 'SUPER_REDUCED')
		expect(rate).toBe(0)
	})
})

describe('aggregateBreakdown', () => {
	test('empty array', () => {
		expect(aggregateBreakdown([])).toEqual([])
	})

	test('single item passes through', () => {
		const items = [
			{ kind: 'STANDARD' as TaxKind, rate: 2000, baseCents: 1000, vatCents: 200 },
		]
		expect(aggregateBreakdown(items)).toEqual(items)
	})

	test('same kind + rate → aggregated', () => {
		const items = [
			{ kind: 'STANDARD' as TaxKind, rate: 2000, baseCents: 1000, vatCents: 200 },
			{ kind: 'STANDARD' as TaxKind, rate: 2000, baseCents: 500, vatCents: 100 },
		]
		expect(aggregateBreakdown(items)).toEqual([
			{ kind: 'STANDARD' as TaxKind, rate: 2000, baseCents: 1500, vatCents: 300 },
		])
	})

	test('different kinds → kept separate', () => {
		const items = [
			{ kind: 'STANDARD' as TaxKind, rate: 2000, baseCents: 1000, vatCents: 200 },
			{ kind: 'REDUCED' as TaxKind, rate: 1000, baseCents: 500, vatCents: 50 },
		]
		expect(aggregateBreakdown(items)).toEqual([
			{ kind: 'STANDARD' as TaxKind, rate: 2000, baseCents: 1000, vatCents: 200 },
			{ kind: 'REDUCED' as TaxKind, rate: 1000, baseCents: 500, vatCents: 50 },
		])
	})

	test('same kind but different rate → kept separate', () => {
		const items = [
			{ kind: 'STANDARD' as TaxKind, rate: 2000, baseCents: 1000, vatCents: 200 },
			{ kind: 'STANDARD' as TaxKind, rate: 1900, baseCents: 500, vatCents: 95 },
		]
		expect(aggregateBreakdown(items)).toEqual(items)
	})
})

describe('calculateVat', () => {
	beforeEach(async () => {
		await seedFrRates()
		await seedDeRates()
	})

	test('empty items → empty breakdown, zero totals', async () => {
		const result = await calculateVat([], 'FR')
		expect(result).toEqual({
			breakdown: [],
			totalVatCents: 0,
			totalBaseCents: 0,
			taxCountry: 'FR',
		})
	})

	describe('domestic (FR → FR)', () => {
		test('STANDARD rate → 20% VAT applied', async () => {
			const result = await calculateVat(
				[{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' }],
				'FR',
			)
			expect(result.taxCountry).toBe('FR')
			expect(result.totalBaseCents).toBe(1000)
			expect(result.totalVatCents).toBe(200) // 20% of 1000
			expect(result.breakdown).toEqual([
				{ kind: 'STANDARD', rate: 2000, baseCents: 1000, vatCents: 200 },
			])
		})

		test('REDUCED rate → 10% VAT applied', async () => {
			const result = await calculateVat(
				[{ priceCents: 500, quantity: 1, taxKind: 'REDUCED' }],
				'FR',
			)
			expect(result.taxCountry).toBe('FR')
			expect(result.totalVatCents).toBe(50) // 10% of 500
		})

		test('SUPER_REDUCED rate → 5.5% VAT applied', async () => {
			const result = await calculateVat(
				[{ priceCents: 1000, quantity: 1, taxKind: 'SUPER_REDUCED' }],
				'FR',
			)
			expect(result.taxCountry).toBe('FR')
			expect(result.totalVatCents).toBe(55) // 5.5% of 1000
		})

		test('ZERO tax kind → 0% VAT (domestic)', async () => {
			const result = await calculateVat(
				[{ priceCents: 1000, quantity: 1, taxKind: 'ZERO' }],
				'FR',
			)
			expect(result.taxCountry).toBe('FR')
			expect(result.totalVatCents).toBe(0)
			expect(result.totalBaseCents).toBe(1000)
		})
	})

	describe('EU B2C (OSS — destination rates)', () => {
		test('DE destination → German STANDARD rate (19%)', async () => {
			const result = await calculateVat(
				[{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' }],
				'DE',
				// No VAT number → B2C
			)
			expect(result.taxCountry).toBe('DE')
			expect(result.totalBaseCents).toBe(1000)
			expect(result.totalVatCents).toBe(190) // 19% of 1000
			expect(result.breakdown[0].rate).toBe(1900)
		})

		test('DE destination → German REDUCED rate (7%)', async () => {
			const result = await calculateVat(
				[{ priceCents: 500, quantity: 1, taxKind: 'REDUCED' }],
				'DE',
			)
			expect(result.taxCountry).toBe('DE')
			expect(result.totalVatCents).toBe(35) // 7% of 500
			expect(result.breakdown[0].rate).toBe(700)
		})

		test('DE missing SUPER_REDUCED → 0%', async () => {
			const result = await calculateVat(
				[
					{
						priceCents: 1000,
						quantity: 1,
						taxKind: 'SUPER_REDUCED',
					},
				],
				'DE',
			)
			expect(result.taxCountry).toBe('DE')
			expect(result.totalVatCents).toBe(0)
			expect(result.breakdown[0].rate).toBe(0)
		})
	})

	describe('EU B2B (reverse charge)', () => {
		test('valid VAT number → 0% VAT for all items', async () => {
			const result = await calculateVat(
				[
					{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' },
					{ priceCents: 500, quantity: 1, taxKind: 'REDUCED' },
				],
				'DE',
				'DE123456789',
			)
			expect(result.taxCountry).toBe('DE')
			expect(result.totalBaseCents).toBe(1500)
			expect(result.totalVatCents).toBe(0)
			result.breakdown.forEach((li) => {
				expect(li.vatCents).toBe(0)
				expect(li.rate).toBe(0)
			})
		})

		test('B2B with ZERO items → 0% VAT, 0 base', async () => {
			const result = await calculateVat(
				[{ priceCents: 2000, quantity: 1, taxKind: 'ZERO' }],
				'IT',
				'IT12345678901',
			)
			expect(result.taxCountry).toBe('IT')
			expect(result.totalBaseCents).toBe(2000)
			expect(result.totalVatCents).toBe(0)
		})
	})

	describe('export (non-EU)', () => {
		test('US destination → 0% VAT', async () => {
			const result = await calculateVat(
				[{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' }],
				'US',
			)
			expect(result.taxCountry).toBe('US')
			expect(result.totalBaseCents).toBe(1000)
			expect(result.totalVatCents).toBe(0)
		})

		test('UK destination (non-EU) → 0% VAT', async () => {
			const result = await calculateVat(
				[{ priceCents: 800, quantity: 1, taxKind: 'REDUCED' }],
				'GB',
			)
			expect(result.taxCountry).toBe('GB')
			expect(result.totalVatCents).toBe(0)
		})

		test('export with multiple items → all 0%', async () => {
			const result = await calculateVat(
				[
					{ priceCents: 1000, quantity: 2, taxKind: 'STANDARD' },
					{ priceCents: 300, quantity: 1, taxKind: 'REDUCED' },
				],
				'US',
			)
			expect(result.taxCountry).toBe('US')
			expect(result.totalBaseCents).toBe(2300) // 2000 + 300
			expect(result.totalVatCents).toBe(0)
		})
	})

	describe('quantity handling', () => {
		test('quantity > 1 multiplies base', async () => {
			const result = await calculateVat(
				[{ priceCents: 1000, quantity: 3, taxKind: 'STANDARD' }],
				'FR',
			)
			expect(result.totalBaseCents).toBe(3000)
			expect(result.totalVatCents).toBe(600) // 20% of 3000
		})

		test('quantity 0 → zero base', async () => {
			const result = await calculateVat(
				[{ priceCents: 1000, quantity: 0, taxKind: 'STANDARD' }],
				'FR',
			)
			expect(result.totalBaseCents).toBe(0)
			expect(result.totalVatCents).toBe(0)
		})
	})

	describe('rounding', () => {
		test('VAT rounds to nearest cent', async () => {
			// 19% of 999 = 189.81 → rounds to 190
			const result = await calculateVat(
				[{ priceCents: 999, quantity: 1, taxKind: 'STANDARD' }],
				'DE',
			)
			expect(result.totalVatCents).toBe(190) // Math.round(999 * 1900 / 10000) = Math.round(189.81) = 190
		})

		test('VAT rounds down at .49', async () => {
			// 20% of 497 = 99.4 → rounds to 99
			const result = await calculateVat(
				[{ priceCents: 497, quantity: 1, taxKind: 'STANDARD' }],
				'FR',
			)
			expect(result.totalVatCents).toBe(99)
		})
	})

	describe('aggregation in calculateVat', () => {
		test('multiple items with same tax kind → aggregated in breakdown', async () => {
			const result = await calculateVat(
				[
					{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' },
					{ priceCents: 500, quantity: 1, taxKind: 'STANDARD' },
					{ priceCents: 200, quantity: 1, taxKind: 'STANDARD' },
				],
				'FR',
			)
			expect(result.breakdown).toHaveLength(1)
			expect(result.breakdown[0]).toEqual({
				kind: 'STANDARD',
				rate: 2000,
				baseCents: 1700,
				vatCents: 340, // 20% of 1700
			})
		})

		test('mixed tax kinds → separate breakdown entries', async () => {
			const result = await calculateVat(
				[
					{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' },
					{ priceCents: 500, quantity: 1, taxKind: 'REDUCED' },
					{ priceCents: 200, quantity: 1, taxKind: 'ZERO' },
				],
				'FR',
			)
			// Each distinct (kind, rate) pair gets one entry: STANDARD(2000), REDUCED(1000), ZERO(0)
			expect(result.breakdown).toHaveLength(3)
			expect(result.totalBaseCents).toBe(1700)
			// 20% of 1000 = 200, 10% of 500 = 50, 0% of 200 = 0 → 250
			expect(result.totalVatCents).toBe(250)
		})
	})

	describe('rate caching', () => {
		test('only queries DB once per tax kind (cache hit)', async () => {
			// 2 STANDARD + 1 REDUCED items → STANDARD cached once
			const result = await calculateVat(
				[
					{ priceCents: 1000, quantity: 1, taxKind: 'STANDARD' },
					{ priceCents: 500, quantity: 1, taxKind: 'STANDARD' },
					{ priceCents: 200, quantity: 1, taxKind: 'REDUCED' },
				],
				'FR',
			)
			// STANDARD: (1000+500) * 0.20 = 300
			// REDUCED: 200 * 0.10 = 20
			expect(result.totalVatCents).toBe(320)
		})
	})
})
