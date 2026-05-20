/**
 * @vitest-environment node
 */
import { http, HttpResponse } from 'msw'
import { describe, expect, test, beforeEach } from 'vitest'
import { server } from '#tests/mocks'
import { validateVatNumber } from './vies.server.ts'

const VIES_ENDPOINT =
	'https://ec.europa.eu/taxation_customs/vies/services/checkVatService'

beforeEach(() => {
	// Each test uses a unique VAT number to avoid cross-test cache pollution
})

describe('validateVatNumber', () => {
	describe('VALID response', () => {
		test('returns VALID with name and address when VIES confirms', async () => {
			server.use(
				http.post(VIES_ENDPOINT, () => {
					return new HttpResponse(
						`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <checkVatResponse xmlns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
      <countryCode>DE</countryCode>
      <vatNumber>123456789</vatNumber>
      <requestDate>2024-01-15+01:00</requestDate>
      <valid>true</valid>
      <name>ACME GMBH</name>
      <address>123 MAIN ST, 10115 BERLIN</address>
    </checkVatResponse>
  </soap:Body>
</soap:Envelope>`,
						{
							status: 200,
							headers: { 'Content-Type': 'text/xml; charset=utf-8' },
						},
					)
				}),
			)

			const result = await validateVatNumber('DE123456789')

			expect(result.status).toBe('VALID')
			expect(result.name).toBe('ACME GMBH')
			expect(result.address).toBe('123 MAIN ST, 10115 BERLIN')
			expect(result.checkedAt).toBeInstanceOf(Date)
		})
	})

	describe('INVALID response', () => {
		test('returns INVALID without name or address', async () => {
			server.use(
				http.post(VIES_ENDPOINT, () => {
					return new HttpResponse(
						`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <checkVatResponse xmlns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
      <countryCode>FR</countryCode>
      <vatNumber>000000000</vatNumber>
      <requestDate>2024-01-15+01:00</requestDate>
      <valid>false</valid>
    </checkVatResponse>
  </soap:Body>
</soap:Envelope>`,
						{
							status: 200,
							headers: { 'Content-Type': 'text/xml; charset=utf-8' },
						},
					)
				}),
			)

			const result = await validateVatNumber('FR000000000')

			expect(result.status).toBe('INVALID')
			expect(result.name).toBeUndefined()
			expect(result.address).toBeUndefined()
			expect(result.checkedAt).toBeInstanceOf(Date)
		})
	})

	describe('timeout handling', () => {
		test(
			'returns OUTAGE when VIES response exceeds 5s timeout',
			async () => {
				const vatNumber = 'IT12345678901'

				server.use(
					http.post(VIES_ENDPOINT, async () => {
						// Delay exceeds the 5s AbortController timeout
						await new Promise((resolve) => setTimeout(resolve, 6_000))
						return new HttpResponse('too late', { status: 200 })
					}),
				)

				const result = await validateVatNumber(vatNumber)

				expect(result.status).toBe('OUTAGE')
				expect(result.name).toBeUndefined()
				expect(result.address).toBeUndefined()
				expect(result.checkedAt).toBeInstanceOf(Date)
			},
			10_000, // Test timeout must exceed the 6s handler delay
		)
	})

	describe('500 error', () => {
		test('returns OUTAGE when VIES returns a 500 error', async () => {
			const vatNumber = 'NL123456789B01'

			server.use(
				http.post(VIES_ENDPOINT, () => {
					return new HttpResponse('Internal Server Error', { status: 500 })
				}),
			)

			const result = await validateVatNumber(vatNumber)

			expect(result.status).toBe('OUTAGE')
			expect(result.checkedAt).toBeInstanceOf(Date)
		})
	})

	describe('caching behavior', () => {
		test('second call within 24h returns cached result without HTTP call', async () => {
			let callCount = 0

			server.use(
				http.post(VIES_ENDPOINT, () => {
					callCount++
					return new HttpResponse(
						`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <checkVatResponse xmlns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
      <countryCode>ES</countryCode>
      <vatNumber>B12345678</vatNumber>
      <requestDate>2024-01-15+01:00</requestDate>
      <valid>true</valid>
      <name>EMPRESA SA</name>
      <address>CALLE MAYOR 1, 28013 MADRID</address>
    </checkVatResponse>
  </soap:Body>
</soap:Envelope>`,
						{
							status: 200,
							headers: { 'Content-Type': 'text/xml; charset=utf-8' },
						},
					)
				}),
			)

			// First call — should hit VIES
			const result1 = await validateVatNumber('ESB12345678')
			expect(result1.status).toBe('VALID')
			expect(result1.name).toBe('EMPRESA SA')
			expect(result1.address).toBe('CALLE MAYOR 1, 28013 MADRID')
			expect(callCount).toBe(1)

			// Second call — should hit cache, no HTTP request
			const result2 = await validateVatNumber('ESB12345678')
			expect(result2.status).toBe('VALID')
			expect(result2.name).toBe('EMPRESA SA')
			expect(result2.address).toBe('CALLE MAYOR 1, 28013 MADRID')
			expect(callCount).toBe(1) // Still 1 — cache served the second call
		})

		test('OUTAGE results are NOT cached — subsequent call re-attempts fetch', async () => {
			const vatNumber = 'BE0123456789'
			let callCount = 0

			server.use(
				http.post(VIES_ENDPOINT, () => {
					callCount++
					return new HttpResponse('Service Unavailable', { status: 503 })
				}),
			)

			// First call — OUTAGE
			const result1 = await validateVatNumber(vatNumber)
			expect(result1.status).toBe('OUTAGE')
			expect(callCount).toBe(1)

			// Second call — should re-fetch, NOT use cache
			const result2 = await validateVatNumber(vatNumber)
			expect(result2.status).toBe('OUTAGE')
			expect(callCount).toBe(2) // Re-fetched — OUTAGE was not cached
		})
	})
})
