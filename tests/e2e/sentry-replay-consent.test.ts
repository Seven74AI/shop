import { test, expect } from '#tests/playwright-utils.ts'

/**
 * Verify that the en_consent cookie is properly readable from client-side
 * JavaScript (document.cookie), which is how monitoring.client.tsx gates
 * Sentry session replay behind analytics consent.
 */

function parseConsentCookie(value: string): { granted: string[]; timestamp: string } {
	try {
		return JSON.parse(value) as { granted: string[]; timestamp: string }
	} catch {
		return JSON.parse(decodeURIComponent(value)) as {
			granted: string[]
			timestamp: string
		}
	}
}

test.describe('Sentry Replay Consent Gating', () => {
	test('consent cookie is readable from document.cookie when analytics granted', async ({
		page,
	}) => {
		// Set consent cookie with analytics granted before navigation
		const consentState = {
			timestamp: new Date().toISOString(),
			granted: ['analytics'],
		}
		await page.context().addCookies([
			{
				name: 'en_consent',
				value: JSON.stringify(consentState),
				domain: 'localhost',
				path: '/',
			},
		])

		await page.goto('/')

		// The banner should NOT be visible (consent already given)
		const banner = page.getByRole('dialog', { name: 'Cookie consent' })
		await expect(banner).not.toBeVisible({ timeout: 20000 })

		// Verify the cookie is readable from document.cookie (httpOnly=false)
		const cookieData = await page.evaluate(() => {
			const cookies = document.cookie.split(';')
			for (const c of cookies) {
				const eqIdx = c.indexOf('=')
				if (eqIdx === -1) continue
				const name = c.substring(0, eqIdx).trim()
				if (name !== 'en_consent') continue
				const value = c.substring(eqIdx + 1).trim()
				if (!value) continue
				// Try both parsing approaches (browser may or may not encode)
				try {
					return JSON.parse(value) as { granted: string[]; timestamp: string }
				} catch {
					return JSON.parse(decodeURIComponent(value)) as {
						granted: string[]
						timestamp: string
					}
				}
			}
			return null
		})

		expect(cookieData).not.toBeNull()
		expect(cookieData!.granted).toContain('analytics')
		expect(cookieData!.timestamp).toBeDefined()
	})

	test('consent cookie is readable from document.cookie when analytics refused', async ({
		page,
	}) => {
		// Set consent cookie WITHOUT analytics (user refused analytics)
		const consentState = {
			timestamp: new Date().toISOString(),
			granted: ['marketing'],
		}
		await page.context().addCookies([
			{
				name: 'en_consent',
				value: JSON.stringify(consentState),
				domain: 'localhost',
				path: '/',
			},
		])

		await page.goto('/')

		// Banner should NOT be visible
		const banner = page.getByRole('dialog', { name: 'Cookie consent' })
		await expect(banner).not.toBeVisible({ timeout: 20000 })

		// Verify analytics is NOT in the granted list
		const cookieData = await page.evaluate(() => {
			const cookies = document.cookie.split(';')
			for (const c of cookies) {
				const eqIdx = c.indexOf('=')
				if (eqIdx === -1) continue
				const name = c.substring(0, eqIdx).trim()
				if (name !== 'en_consent') continue
				const value = c.substring(eqIdx + 1).trim()
				if (!value) continue
				try {
					return JSON.parse(value) as { granted: string[]; timestamp: string }
				} catch {
					return JSON.parse(decodeURIComponent(value)) as {
						granted: string[]
						timestamp: string
					}
				}
			}
			return null
		})

		expect(cookieData).not.toBeNull()
		expect(cookieData!.granted).not.toContain('analytics')
	})

	test('after Accept All via banner, cookie is client-readable with analytics', async ({
		page,
	}) => {
		await page.goto('/')

		const banner = page.getByRole('dialog', { name: 'Cookie consent' })
		await expect(banner).toBeVisible({ timeout: 20000 })

		// Accept All (includes analytics)
		await banner.getByRole('button', { name: 'Accept All' }).click()

		// Banner should disappear
		await expect(banner).not.toBeVisible()

		// Verify cookie was set and is client-readable
		const cookies = await page.context().cookies()
		const consentCookie = cookies.find((c) => c.name === 'en_consent')
		expect(consentCookie).toBeDefined()
		const value = parseConsentCookie(consentCookie!.value)
		expect(value.granted).toContain('analytics')
		expect(value.granted).toContain('marketing')

		// Verify cookie is also readable from document.cookie
		const docCookieData = await page.evaluate(() => {
			const cookies = document.cookie.split(';')
			for (const c of cookies) {
				const eqIdx = c.indexOf('=')
				if (eqIdx === -1) continue
				const name = c.substring(0, eqIdx).trim()
				if (name !== 'en_consent') continue
				const value = c.substring(eqIdx + 1).trim()
				if (!value) continue
				try {
					return JSON.parse(value) as { granted: string[] }
				} catch {
					return JSON.parse(decodeURIComponent(value)) as { granted: string[] }
				}
			}
			return null
		})
		expect(docCookieData).not.toBeNull()
		expect(docCookieData!.granted).toContain('analytics')
	})

	test('after Refuse All via banner, cookie is client-readable without analytics', async ({
		page,
	}) => {
		await page.goto('/')

		const banner = page.getByRole('dialog', { name: 'Cookie consent' })
		await expect(banner).toBeVisible({ timeout: 20000 })

		// Refuse All
		await banner.getByRole('button', { name: 'Refuse All' }).click()

		// Banner should disappear
		await expect(banner).not.toBeVisible()

		// Verify cookie was set with empty grants
		const cookies = await page.context().cookies()
		const consentCookie = cookies.find((c) => c.name === 'en_consent')
		expect(consentCookie).toBeDefined()
		const value = parseConsentCookie(consentCookie!.value)
		expect(value.granted).toEqual([])

		// Verify analytics is not present via document.cookie
		const docCookieData = await page.evaluate(() => {
			const cookies = document.cookie.split(';')
			for (const c of cookies) {
				const eqIdx = c.indexOf('=')
				if (eqIdx === -1) continue
				const name = c.substring(0, eqIdx).trim()
				if (name !== 'en_consent') continue
				const value = c.substring(eqIdx + 1).trim()
				if (!value) continue
				try {
					return JSON.parse(value) as { granted: string[] }
				} catch {
					return JSON.parse(decodeURIComponent(value)) as { granted: string[] }
				}
			}
			return null
		})
		expect(docCookieData).not.toBeNull()
		expect(docCookieData!.granted).not.toContain('analytics')
	})

	test('Sentry replay gating: hasAnalyticsConsent logic replicates monitoring.client behavior', async ({
		page,
	}) => {
		// This test replicates the exact logic from monitoring.client.tsx's
		// hasAnalyticsConsent() function to verify it works in-browser.

		// Case 1: analytics granted
		const withAnalytics = {
			timestamp: new Date().toISOString(),
			granted: ['analytics', 'marketing'],
		}
		await page.context().addCookies([
			{
				name: 'en_consent',
				value: JSON.stringify(withAnalytics),
				domain: 'localhost',
				path: '/',
			},
		])
		await page.goto('/')

		const resultWithAnalytics = await page.evaluate(() => {
			// Exact copy of hasAnalyticsConsent() from monitoring.client.tsx
			try {
				const cookies = document.cookie.split(';')
				for (const c of cookies) {
					const eqIdx = c.indexOf('=')
					if (eqIdx === -1) continue
					const name = c.substring(0, eqIdx).trim()
					if (name !== 'en_consent') continue
					const value = c.substring(eqIdx + 1).trim()
					if (!value) continue
					const state = JSON.parse(
						decodeURIComponent(value),
					) as { granted?: string[] }
					if (
						Array.isArray(state.granted) &&
						state.granted.includes('analytics')
					) {
						return true
					}
				}
			} catch {
				// If cookie is malformed or absent, assume no consent
			}
			return false
		})

		expect(resultWithAnalytics).toBe(true)

		// Case 2: analytics refused (marketing only)
		await page.context().clearCookies()
		const withoutAnalytics = {
			timestamp: new Date().toISOString(),
			granted: ['marketing'],
		}
		await page.context().addCookies([
			{
				name: 'en_consent',
				value: JSON.stringify(withoutAnalytics),
				domain: 'localhost',
				path: '/',
			},
		])
		await page.goto('/')

		const resultWithoutAnalytics = await page.evaluate(() => {
			try {
				const cookies = document.cookie.split(';')
				for (const c of cookies) {
					const eqIdx = c.indexOf('=')
					if (eqIdx === -1) continue
					const name = c.substring(0, eqIdx).trim()
					if (name !== 'en_consent') continue
					const value = c.substring(eqIdx + 1).trim()
					if (!value) continue
					const state = JSON.parse(
						decodeURIComponent(value),
					) as { granted?: string[] }
					if (
						Array.isArray(state.granted) &&
						state.granted.includes('analytics')
					) {
						return true
					}
				}
			} catch {
				// noop
			}
			return false
		})

		expect(resultWithoutAnalytics).toBe(false)

		// Case 3: no cookie at all (first visit)
		await page.context().clearCookies()
		await page.goto('/')

		const resultNoCookie = await page.evaluate(() => {
			try {
				const cookies = document.cookie.split(';')
				for (const c of cookies) {
					const eqIdx = c.indexOf('=')
					if (eqIdx === -1) continue
					const name = c.substring(0, eqIdx).trim()
					if (name !== 'en_consent') continue
					const value = c.substring(eqIdx + 1).trim()
					if (!value) continue
					const state = JSON.parse(
						decodeURIComponent(value),
					) as { granted?: string[] }
					if (
						Array.isArray(state.granted) &&
						state.granted.includes('analytics')
					) {
						return true
					}
				}
			} catch {
				// noop
			}
			return false
		})

		expect(resultNoCookie).toBe(false)
	})
})
