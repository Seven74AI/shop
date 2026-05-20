/**
 * VIES VAT Number Validation
 *
 * Validates EU VAT numbers against the VIES (VAT Information Exchange System)
 * SOAP service. Results are cached for 24 hours. During VIES outages, the
 * order should be flagged `vatValidationStatus = "OUTAGE"` for manual review.
 *
 * VIES endpoint: https://ec.europa.eu/taxation_customs/vies/services/checkVatService
 * Note: Add `ec.europa.eu` to CSP connect-src (P3.1).
 */

import { XMLParser } from 'fast-xml-parser'
import { lruCache } from './cache.server.ts'

/** VIES SOAP endpoint */
const VIES_ENDPOINT =
	'https://ec.europa.eu/taxation_customs/vies/services/checkVatService'

/** Fetch timeout for VIES requests (5 seconds) */
const VIES_TIMEOUT_MS = 5_000

/** Cache TTL for VALID and INVALID results (24 hours in milliseconds) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Cache key prefix for VIES validation results */
const CACHE_KEY_PREFIX = 'vies:'

/** Result of a VIES VAT number validation */
export interface ViesValidationResult {
	status: 'VALID' | 'INVALID' | 'OUTAGE'
	/** Company name (only present when VALID) */
	name?: string
	/** Company address (only present when VALID) */
	address?: string
	/** Timestamp of the VIES check */
	checkedAt: Date
}

/**
 * Split a full VAT number into country code and number parts.
 * Format: 2-letter ISO country code + up to 12 alphanumeric characters.
 * Validation is done at the form level via Zod — this is for routing only.
 */
function splitVatNumber(vatNumber: string): {
	countryCode: string
	number: string
} {
	return {
		countryCode: vatNumber.slice(0, 2).toUpperCase(),
		number: vatNumber.slice(2),
	}
}

/**
 * Build the SOAP request body for checkVat.
 */
function buildCheckVatRequest(countryCode: string, vatNumber: string): string {
	return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <checkVat xmlns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
      <countryCode>${countryCode}</countryCode>
      <vatNumber>${vatNumber}</vatNumber>
    </checkVat>
  </soap:Body>
</soap:Envelope>`
}

/**
 * Parse the VIES SOAP response XML and extract the validation result.
 */
function parseCheckVatResponse(xmlText: string): {
	valid: boolean
	name?: string
	address?: string
} {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
		textNodeName: '#text',
		parseAttributeValue: false,
		trimValues: true,
	})

	const parsed = parser.parse(xmlText)

	// Navigate SOAP envelope: Envelope → Body → checkVatResponse
	const envelope =
		parsed['soap:Envelope'] || parsed['soap:envelope'] || parsed.Envelope
	const body = envelope?.['soap:Body'] || envelope?.Body
	const response = body?.checkVatResponse

	if (!response) {
		return { valid: false }
	}

	const valid = response.valid === 'true' || response.valid === true
	const name: string | undefined =
		typeof response.name === 'string' && response.name.length > 0
			? response.name
			: undefined
	const address: string | undefined =
		typeof response.address === 'string' && response.address.length > 0
			? response.address
			: undefined

	return { valid, name, address }
}

/**
 * Query the VIES service directly (no caching).
 * Returns OUTAGE status on timeout, network errors, or 5xx responses.
 */
async function queryVies(vatNumber: string): Promise<ViesValidationResult> {
	const { countryCode, number } = splitVatNumber(vatNumber)
	const soapBody = buildCheckVatRequest(countryCode, number)

	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), VIES_TIMEOUT_MS)

	try {
		const response = await fetch(VIES_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				// SOAPAction header — empty for checkVat per the VIES WSDL
				SOAPAction: '',
			},
			body: soapBody,
			signal: controller.signal,
		})

		if (!response.ok) {
			return { status: 'OUTAGE', checkedAt: new Date() }
		}

		const xmlText = await response.text()
		const { valid, name, address } = parseCheckVatResponse(xmlText)

		return {
			status: valid ? 'VALID' : 'INVALID',
			name,
			address,
			checkedAt: new Date(),
		}
	} catch {
		// Timeout (AbortError), network error, DNS failure → OUTAGE
		return { status: 'OUTAGE', checkedAt: new Date() }
	} finally {
		clearTimeout(timeoutId)
	}
}

/**
 * Validate an EU VAT number against the VIES registry.
 *
 * Results are cached for 24 hours via the application's LRU cache:
 * - VALID and INVALID results are cached
 * - OUTAGE results are NOT cached (every call during an outage re-attempts)
 *
 * @param vatNumber - Full VAT number including country prefix (e.g., "DE123456789")
 * @returns Validation result with status, optional company details, and check timestamp
 */
export async function validateVatNumber(
	vatNumber: string,
): Promise<ViesValidationResult> {
	const cacheKey = `${CACHE_KEY_PREFIX}${vatNumber}`

	// Check LRU cache first (handles TTL expiry internally)
	const cachedEntry = lruCache.get(cacheKey)
	if (cachedEntry?.value) {
		const cached = cachedEntry.value as ViesValidationResult
		const age = Date.now() - (cachedEntry.metadata?.createdTime ?? 0)
		if (age < CACHE_TTL_MS) {
			return cached
		}
		// TTL expired — remove stale entry
		lruCache.delete(cacheKey)
	}

	// Query VIES
	const result = await queryVies(vatNumber)

	// Only cache VALID and INVALID results (not OUTAGE)
	if (result.status !== 'OUTAGE') {
		lruCache.set(cacheKey, {
			metadata: {
				createdTime: Date.now(),
				ttl: CACHE_TTL_MS,
				swr: null,
			},
			value: result,
		})
	}

	return result
}
