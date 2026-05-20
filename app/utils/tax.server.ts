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
