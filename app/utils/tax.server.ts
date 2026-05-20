import { type TaxKind } from '@prisma/client'
import { prisma } from './db.server.ts'

/**
 * EU-27 country codes (for OSS rules).
 * France is the merchant/home country.
 */
export const EU_COUNTRIES = new Set([
	'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
	'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
	'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

/** The home/merchant country for this store. */
export const MERCHANT_COUNTRY = 'FR'

/**
 * A single VAT line item breakdown.
 */
export interface VatLineItem {
	kind: TaxKind
	rate: number // basis points (2000 = 20%)
	baseCents: number
	vatCents: number
}

/**
 * Result of a VAT calculation for an order.
 */
export interface VatCalculation {
	breakdown: VatLineItem[]
	totalVatCents: number
	totalBaseCents: number
	taxCountry: string
}

/**
 * A cart/item-like input for tax calculation.
 */
export interface TaxableItem {
	priceCents: number
	quantity: number
	taxKind: TaxKind
}

/**
 * Determine the effective tax country for an order based on OSS rules.
 *
 * Rules:
 * - FR → FR (always charge domestic VAT)
 * - Non-EU → export (0% VAT)
 * - EU B2B with valid VAT → reverse charge (0% VAT), taxCountry = destination
 * - EU B2C (no VAT number) → OSS: use destination country rate
 */
export function resolveTaxCountry(
	shippingCountry: string,
	customerVatNumber?: string | null,
): { taxCountry: string; reverseCharge: boolean } {
	const dest = shippingCountry.toUpperCase()

	// Domestic: always charge FR VAT
	if (dest === MERCHANT_COUNTRY) {
		return { taxCountry: MERCHANT_COUNTRY, reverseCharge: false }
	}

	// Export outside EU: no VAT
	if (!EU_COUNTRIES.has(dest)) {
		return { taxCountry: dest, reverseCharge: false }
	}

	// EU B2B with valid VAT → reverse charge
	if (customerVatNumber && customerVatNumber.trim().length > 0) {
		return { taxCountry: dest, reverseCharge: true }
	}

	// EU B2C → OSS: destination country rate
	return { taxCountry: dest, reverseCharge: false }
}

/**
 * Get the active tax rate for a given country and tax kind.
 * Returns 0 for ZERO tax kind without hitting the database.
 */
export async function getTaxRate(
	country: string,
	kind: TaxKind,
): Promise<number> {
	if (kind === 'ZERO') return 0

	const rate = await prisma.taxRate.findFirst({
		where: {
			country,
			kind,
			isActive: true,
			effectiveFrom: { lte: new Date() },
			OR: [
				{ effectiveTo: null },
				{ effectiveTo: { gte: new Date() } },
			],
		},
		orderBy: { effectiveFrom: 'desc' },
		select: { rate: true },
	})

	return rate?.rate ?? 0
}

/**
 * Calculate VAT for a set of taxable items with a given shipping destination.
 *
 * Handles all OSS scenarios:
 * - Domestic (FR → FR): French VAT rates
 * - EU B2B (reverse charge): 0% VAT recorded under destination country
 * - EU B2C (OSS): destination country rates
 * - Export (non-EU): 0% VAT
 *
 * Rates are cached per tax kind to avoid redundant database lookups.
 * Line items with the same (kind, rate) are aggregated in the breakdown.
 */
export async function calculateVat(
	items: TaxableItem[],
	shippingCountry: string,
	customerVatNumber?: string | null,
): Promise<VatCalculation> {
	const { taxCountry, reverseCharge } = resolveTaxCountry(
		shippingCountry,
		customerVatNumber,
	)

	if (items.length === 0) {
		return { breakdown: [], totalVatCents: 0, totalBaseCents: 0, taxCountry }
	}

	// Reverse charge → all VAT is 0 regardless of tax kind
	if (reverseCharge) {
		const breakdown: VatLineItem[] = items.map((item) => {
			const baseCents = item.priceCents * item.quantity
			return {
				kind: item.taxKind,
				rate: 0,
				baseCents,
				vatCents: 0,
			}
		})
		return {
			breakdown: aggregateBreakdown(breakdown),
			totalVatCents: 0,
			totalBaseCents: breakdown.reduce((sum, li) => sum + li.baseCents, 0),
			taxCountry,
		}
	}

	// Cache rates to avoid repeated DB calls for the same tax kind
	const rateCache = new Map<TaxKind, number>()
	const breakdown: VatLineItem[] = []

	for (const item of items) {
		const baseCents = item.priceCents * item.quantity

		if (!rateCache.has(item.taxKind)) {
			rateCache.set(item.taxKind, await getTaxRate(taxCountry, item.taxKind))
		}

		const rate = rateCache.get(item.taxKind)!
		// rate is in basis points (e.g. 2000 = 20%); convert to fraction
		const vatCents = Math.round((baseCents * rate) / 10_000)

		breakdown.push({ kind: item.taxKind, rate, baseCents, vatCents })
	}

	const aggregated = aggregateBreakdown(breakdown)

	return {
		breakdown: aggregated,
		totalVatCents: aggregated.reduce((sum, li) => sum + li.vatCents, 0),
		totalBaseCents: aggregated.reduce((sum, li) => sum + li.baseCents, 0),
		taxCountry,
	}
}

/**
 * Aggregate line items that share the same (kind, rate) pair.
 */
export function aggregateBreakdown(items: VatLineItem[]): VatLineItem[] {
	const map = new Map<string, VatLineItem>()
	for (const item of items) {
		const key = `${item.kind}:${item.rate}`
		const existing = map.get(key)
		if (existing) {
			existing.baseCents += item.baseCents
			existing.vatCents += item.vatCents
		} else {
			map.set(key, { ...item })
		}
	}
	return [...map.values()]
}
