import { describe, expect, test } from 'vitest'
import { action } from './cookie-consent'

// Helper to create a Request with FormData
function createConsentRequest({
	analytics,
	marketing,
	redirectTo,
	method = 'POST',
}: {
	analytics?: string
	marketing?: string
	redirectTo?: string
	method?: string
} = {}): Request {
	const formData = new FormData()
	if (analytics !== undefined) formData.set('analytics', analytics)
	if (marketing !== undefined) formData.set('marketing', marketing)
	if (redirectTo) formData.set('redirectTo', redirectTo)

	return new Request('https://example.com/resources/cookie-consent', {
		method,
		body: formData,
	})
}

function args(request: Request) {
	return {
		request,
		params: {},
		context: {},
		url: new URL(request.url),
		pattern: '',
	}
}

/** Extract the data result with its init property */
type ConsentDataResult = {
	data: { success: boolean; error?: string; consent?: { necessary: boolean; analytics: boolean; marketing: boolean } }
	init: { status?: number; headers?: Headers }
}

describe('cookie-consent resource route', () => {
	describe('action', () => {
		test('sets consent cookie when analytics and marketing are both true', async () => {
			const request = createConsentRequest({
				analytics: 'true',
				marketing: 'true',
			})
			const response = await action(args(request))
			const dataResult = response as unknown as ConsentDataResult

			expect(dataResult.init?.status ?? 200).toBe(200)

			const setCookie = dataResult.init?.headers?.get('Set-Cookie')
			expect(setCookie).toBeDefined()
			expect(setCookie).toContain('cookieConsent=')
			expect(setCookie).toContain('Path=/')
		})

		test('sets consent cookie when analytics and marketing are both false', async () => {
			const request = createConsentRequest({
				analytics: 'false',
				marketing: 'false',
			})
			const response = await action(args(request))
			const dataResult = response as unknown as ConsentDataResult

			expect(dataResult.init?.status ?? 200).toBe(200)

			const setCookie = dataResult.init?.headers?.get('Set-Cookie')
			expect(setCookie).toBeDefined()
			expect(setCookie).toContain('cookieConsent=')
		})

		test('sets consent cookie when only analytics is true', async () => {
			const request = createConsentRequest({
				analytics: 'true',
				marketing: 'false',
			})
			const response = await action(args(request))
			const dataResult = response as unknown as ConsentDataResult

			expect(dataResult.init?.status ?? 200).toBe(200)

			const setCookie = dataResult.init?.headers?.get('Set-Cookie')
			expect(setCookie).toBeDefined()
			expect(setCookie).toContain('cookieConsent=')
		})

		test('accepts checkbox "on" value for analytics', async () => {
			const request = createConsentRequest({
				analytics: 'on',
				marketing: 'false',
			})
			const response = await action(args(request))
			const dataResult = response as unknown as ConsentDataResult

			expect(dataResult.init?.status ?? 200).toBe(200)

			const setCookie = dataResult.init?.headers?.get('Set-Cookie')
			expect(setCookie).toBeDefined()
		})

		test('redirects when redirectTo is provided', async () => {
			const request = createConsentRequest({
				analytics: 'true',
				marketing: 'false',
				redirectTo: '/products',
			})
			const response = await action(args(request))

			// Should be a redirect (status 302) — Response not DataWithResponseInit
			const redirectResponse = response as unknown as Response
			expect(redirectResponse.status).toBe(302)
			expect(redirectResponse.headers.get('Location')).toBe('/products')

			// Should still set the cookie
			const setCookie = redirectResponse.headers.get('Set-Cookie')
			expect(setCookie).toBeDefined()
			expect(setCookie).toContain('cookieConsent=')
		})

		test('does NOT redirect when redirectTo is not in formData', async () => {
			const request = createConsentRequest({
				analytics: 'true',
				marketing: 'false',
			})
			const response = await action(args(request))
			const dataResult = response as unknown as ConsentDataResult

			expect(dataResult.init?.status ?? 200).toBe(200)
			expect(dataResult.init?.headers?.get('Location') ?? null).toBeNull()
		})

		test('cookie value encodes consent preferences correctly', async () => {
			const request = createConsentRequest({
				analytics: 'true',
				marketing: 'false',
			})
			const response = await action(args(request))
			const dataResult = response as unknown as ConsentDataResult

			const setCookie = dataResult.init?.headers?.get('Set-Cookie')
			expect(setCookie).toBeDefined()

			// Extract the cookie value
			const match = setCookie!.match(/cookieConsent=([^;]+)/)
			expect(match).not.toBeNull()
			const decoded = JSON.parse(decodeURIComponent(match![1]!)) as {
				necessary: boolean
				analytics: boolean
				marketing: boolean
			}
			expect(decoded).toEqual({
				necessary: true,
				analytics: true,
				marketing: false,
			})
		})

		test('cookie value always has necessary=true', async () => {
			const request = createConsentRequest({
				analytics: 'false',
				marketing: 'false',
			})
			const response = await action(args(request))
			const dataResult = response as unknown as ConsentDataResult

			const setCookie = dataResult.init?.headers?.get('Set-Cookie')
			expect(setCookie).toBeDefined()

			const match = setCookie!.match(/cookieConsent=([^;]+)/)
			expect(match).not.toBeNull()
			const decoded = JSON.parse(decodeURIComponent(match![1]!)) as {
				necessary: boolean
			}
			expect(decoded.necessary).toBe(true)
		})
	})
})
