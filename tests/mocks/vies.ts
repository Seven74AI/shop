import { http, HttpResponse } from 'msw'

const VIES_ENDPOINT =
	'https://ec.europa.eu/taxation_customs/vies/services/checkVatService'

/**
 * Build a VIES SOAP response XML string
 */
function buildSoapResponse(params: {
	valid: boolean
	name?: string
	address?: string
	countryCode?: string
	vatNumber?: string
}): string {
	const { valid, name, address, countryCode = 'DE', vatNumber = '123456789' } = params
	return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <checkVatResponse xmlns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
      <countryCode>${countryCode}</countryCode>
      <vatNumber>${vatNumber}</vatNumber>
      <requestDate>2024-01-15+01:00</requestDate>
      <valid>${valid}</valid>
      ${name ? `<name>${name}</name>` : ''}
      ${address ? `<address>${address}</address>` : ''}
    </checkVatResponse>
  </soap:Body>
</soap:Envelope>`
}

/**
 * Default handler: returns VALID response for any VAT number
 */
const defaultHandler = http.post(VIES_ENDPOINT, async () => {
	return new HttpResponse(
		buildSoapResponse({
			valid: true,
			name: 'TEST COMPANY GMBH',
			address: '123 TEST STRASSE, 10115 BERLIN',
		}),
		{
			status: 200,
			headers: { 'Content-Type': 'text/xml; charset=utf-8' },
		},
	)
})

export const handlers = [defaultHandler]
