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
 * Calculate VAT for a single taxable item.
 *
 * @param priceCents - Price in cents (tax-exclusive)
 * @param taxKind - The tax kind of the product
 * @param taxCountry - The country whose rate to use
 * @param reverseCharge - If true, VAT is 0 (B2B reverse charge)
 * @returns A VatLineItem with the calculated VAT
 */
export function calculateItemVat(
	priceCents: number,
	quantity: number,
	taxKind: TaxKind,
	rateBasisPoints: number,
	reverseCharge: boolean,
): VatLineItem {
	const baseCents = priceCents * quantity
	const effectiveRate = reverseCharge ? 0 : rateBasisPoints
	const vatCents = Math.round((baseCents * effectiveRate) / 10000) // basis points → fraction

	return {
		kind: taxKind,
		rate: effectiveRate,
		baseCents,
		vatCents,
	}
}

/**
 * Group VAT line items by (kind, rate) for a compact breakdown.
 */
function mergeBreakdown(items: VatLineItem[]): VatLineItem[] {
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

	return Array.from(map.values())
}

/**
 * Calculate VAT for a full order.
 *
 * @param items - Array of taxable items (from cart)
 * @param shippingCountry - ISO 2-letter destination country
 * @param customerVatNumber - Optional customer VAT number (for B2B reverse charge)
 * @returns Complete VAT calculation with breakdown
 */
export async function calculateOrderVat(
	items: TaxableItem[],
	shippingCountry: string,
	customerVatNumber?: string | null,
): Promise<VatCalculation> {
	const { taxCountry, reverseCharge } = resolveTaxCountry(
		shippingCountry,
		customerVatNumber,
	)

	// For reverse charge or non-EU exports, no VAT is charged
	if (reverseCharge || !EU_COUNTRIES.has(taxCountry)) {
		let totalBaseCents = 0
		for (const item of items) {
			totalBaseCents += item.priceCents * item.quantity
		}
		return {
			breakdown: [],
			totalVatCents: 0,
			totalBaseCents,
			taxCountry,
		}
	}

	// Collect unique (kind) pairs to fetch rates in one go
	const kindSet = new Set<TaxKind>()
	for (const item of items) {
		kindSet.add(item.taxKind)
	}

	// Fetch rates for all needed kinds
	const rateMap = new Map<TaxKind, number>()
	for (const kind of kindSet) {
		rateMap.set(kind, await getTaxRate(taxCountry, kind))
	}

	// Calculate per-item VAT
	const lineItems: VatLineItem[] = []
	for (const item of items) {
		const rate = rateMap.get(item.taxKind) ?? 0
		lineItems.push(
			calculateItemVat(
				item.priceCents,
				item.quantity,
				item.taxKind,
				rate,
				reverseCharge,
			),
		)
	}

	const breakdown = mergeBreakdown(lineItems)
	const totalVatCents = breakdown.reduce((sum, li) => sum + li.vatCents, 0)
	const totalBaseCents = breakdown.reduce((sum, li) => sum + li.baseCents, 0)

	return {
		breakdown,
		totalVatCents,
		totalBaseCents,
		taxCountry,
	}
}

/**
 * Format basis points to a human-readable percentage string.
 * 2000 → "20.00%"
 */
export function formatBasisPoints(bp: number): string {
	return `${(bp / 100).toFixed(2)}%`
}
