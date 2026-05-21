/**
 * @vitest-environment node
 *
 * Locale switch action tests — verifies locale cookie is set,
 * redirect works, and error handling for invalid input.
 * Uses test helpers for DRY setup.
 */
import { describe, expect, test } from 'vitest'
import { action } from './locale-switch.tsx'
import {
	makeLocaleSwitchRequest,
	assertLocaleCookie,
	assertRedirect,
} from '#tests/helpers/i18n.ts'

// ─── Valid locale submissions ───────────────────────────────────────

describe('locale-switch action', () => {
	describe('valid submissions', () => {
		test('sets locale cookie to "fr" and redirects to /', async () => {
			const request = makeLocaleSwitchRequest('fr')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			assertRedirect(response, '/')
			assertLocaleCookie(response, 'fr')
		})

		test('sets locale cookie to "en" and redirects to /', async () => {
			const request = makeLocaleSwitchRequest('en')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			assertRedirect(response, '/')
			assertLocaleCookie(response, 'en')
		})

		test('redirects to specified redirectTo path', async () => {
			const request = makeLocaleSwitchRequest('fr', '/shop')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			assertRedirect(response, '/shop')
			assertLocaleCookie(response, 'fr')
		})

		test('redirects to nested path', async () => {
			const request = makeLocaleSwitchRequest(
				'en',
				'/shop/products/42',
			)
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			assertRedirect(response, '/shop/products/42')
		})

		test('cookie contains all required attributes', async () => {
			const request = makeLocaleSwitchRequest('fr')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			const setCookie = response.headers.get('set-cookie')
			expect(setCookie).toContain('localePreference=fr')
			expect(setCookie).toContain('Max-Age=31536000')
			expect(setCookie).toContain('Path=/')
			expect(setCookie).toContain('SameSite=Lax')
		})
	})

	describe('error handling', () => {
		test('rejects invalid locale (de)', async () => {
			const request = makeLocaleSwitchRequest('invalid')
			await expect(
				action({
					request,
					params: {},
					context: {},
					url: new URL(
						'http://localhost:3000/resources/locale-switch',
					),
					pattern: '',
				}),
			).rejects.toThrow()
		})

		test('rejects missing locale', async () => {
			const formData = new FormData()
			const request = new Request(
				'http://localhost:3000/resources/locale-switch',
				{
					method: 'POST',
					body: formData,
				},
			)

			await expect(
				action({
					request,
					params: {},
					context: {},
					url: new URL(
						'http://localhost:3000/resources/locale-switch',
					),
					pattern: '',
				}),
			).rejects.toThrow()
		})

		test('rejects empty locale string', async () => {
			const formData = new FormData()
			formData.append('locale', '')
			const request = new Request(
				'http://localhost:3000/resources/locale-switch',
				{
					method: 'POST',
					body: formData,
				},
			)

			await expect(
				action({
					request,
					params: {},
					context: {},
					url: new URL(
						'http://localhost:3000/resources/locale-switch',
					),
					pattern: '',
				}),
			).rejects.toThrow()
		})

		test('rejects unsupported locale that looks plausible (es)', async () => {
			const formData = new FormData()
			formData.append('locale', 'es')
			const request = new Request(
				'http://localhost:3000/resources/locale-switch',
				{
					method: 'POST',
					body: formData,
				},
			)

			await expect(
				action({
					request,
					params: {},
					context: {},
					url: new URL(
						'http://localhost:3000/resources/locale-switch',
					),
					pattern: '',
				}),
			).rejects.toThrow()
		})
	})

	describe('locale switching preserves context', () => {
		test('switching from fr to en sets correct cookie', async () => {
			const request = makeLocaleSwitchRequest('en', '/shop')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			assertRedirect(response, '/shop')
			assertLocaleCookie(response, 'en')
		})

		test('switching from en to fr preserves redirect path', async () => {
			const request = makeLocaleSwitchRequest('fr', '/admin/orders')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			assertRedirect(response, '/admin/orders')
			assertLocaleCookie(response, 'fr')
		})
	})

	describe('response structure', () => {
		test('response has status 302 (redirect)', async () => {
			const request = makeLocaleSwitchRequest('fr')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			expect(response.status).toBe(302)
		})

		test('response has set-cookie header', async () => {
			const request = makeLocaleSwitchRequest('en')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			expect(response.headers.has('set-cookie')).toBe(true)
		})

		test('response has location header', async () => {
			const request = makeLocaleSwitchRequest('fr')
			const response = (await action({
				request,
				params: {},
				context: {},
				url: new URL(
					'http://localhost:3000/resources/locale-switch',
				),
				pattern: '',
			})) as Response

			expect(response.headers.has('location')).toBe(true)
		})
	})
})
