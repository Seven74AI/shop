/**
 * @vitest-environment node
 */
import { describe, expect, test } from 'vitest'
import { action } from './locale-switch.tsx'

describe('locale-switch action', () => {
	test('sets locale cookie to "fr" and redirects to /', async () => {
		const formData = new FormData()
		formData.append('locale', 'fr')

		const request = new Request('http://localhost:3000/resources/locale-switch', {
			method: 'POST',
			body: formData,
		})

		const response = await action({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost:3000/resources/locale-switch'),
			pattern: '',
		})

		expect(response).toHaveProperty('headers')
		expect((response as Response).status).toBe(302)
		expect((response as Response).headers.get('location')).toBe('/')
		const setCookie = (response as Response).headers.get('set-cookie')
		expect(setCookie).toContain('localePreference=fr')
		expect(setCookie).toContain('Max-Age=31536000')
		expect(setCookie).toContain('Path=/')
	})

	test('sets locale cookie to "en" and redirects to /', async () => {
		const formData = new FormData()
		formData.append('locale', 'en')

		const request = new Request('http://localhost:3000/resources/locale-switch', {
			method: 'POST',
			body: formData,
		})

		const response = await action({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost:3000/resources/locale-switch'),
			pattern: '',
		})

		expect(response).toHaveProperty('headers')
		expect((response as Response).status).toBe(302)
		expect((response as Response).headers.get('location')).toBe('/')
		const setCookie = (response as Response).headers.get('set-cookie')
		expect(setCookie).toContain('localePreference=en')
	})

	test('redirects to specified redirectTo path', async () => {
		const formData = new FormData()
		formData.append('locale', 'fr')
		formData.append('redirectTo', '/shop')

		const request = new Request('http://localhost:3000/resources/locale-switch', {
			method: 'POST',
			body: formData,
		})

		const response = await action({
			request,
			params: {},
			context: {},
			url: new URL('http://localhost:3000/resources/locale-switch'),
			pattern: '',
		})

		expect(response).toHaveProperty('headers')
		expect((response as Response).status).toBe(302)
		const location = (response as Response).headers.get('location')
		expect(location).toBe('/shop')
		const setCookie = (response as Response).headers.get('set-cookie')
		expect(setCookie).toContain('localePreference=fr')
	})

	test('rejects invalid locale', async () => {
		const formData = new FormData()
		formData.append('locale', 'de')

		const request = new Request('http://localhost:3000/resources/locale-switch', {
			method: 'POST',
			body: formData,
		})

		await expect(
			action({
				request,
				params: {},
				context: {},
				url: new URL('http://localhost:3000/resources/locale-switch'),
				pattern: '',
			}),
		).rejects.toThrow()
	})

	test('rejects missing locale', async () => {
		const formData = new FormData()

		const request = new Request('http://localhost:3000/resources/locale-switch', {
			method: 'POST',
			body: formData,
		})

		await expect(
			action({
				request,
				params: {},
				context: {},
				url: new URL('http://localhost:3000/resources/locale-switch'),
				pattern: '',
			}),
		).rejects.toThrow()
	})
})
