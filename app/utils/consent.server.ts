import * as cookie from 'cookie'
import {
	CONSENT_CATEGORIES,
	type ConsentCategory,
	type ConsentState,
} from './consent.ts'

const cookieName = 'en_consent'

/**
 * Parse the consent cookie from a request.
 * Returns null if no consent has been given yet.
 */
export function getConsent(request: Request): ConsentState | null {
	const cookieHeader = request.headers.get('cookie')
	if (!cookieHeader) return null

	const parsed = cookie.parse(cookieHeader)
	const raw = parsed[cookieName]
	if (!raw) return null

	try {
		const state = JSON.parse(decodeURIComponent(raw)) as ConsentState
		// Validate structure
		if (
			typeof state.timestamp !== 'string' ||
			!Array.isArray(state.granted) ||
			!state.granted.every((c: unknown) =>
				CONSENT_CATEGORIES.includes(c as ConsentCategory),
			)
		) {
			return null
		}
		return state
	} catch {
		return null
	}
}

/**
 * Serialize the consent cookie. Set maxAge to 6 months (CNIL recommends ~6 months).
 * Use empty granted array to record a refusal (timestamp proves user saw the banner).
 */
export function setConsent(state: ConsentState): string {
	const value = encodeURIComponent(JSON.stringify(state))
	return cookie.serialize(cookieName, value, {
		path: '/',
		maxAge: 60 * 60 * 24 * 180, // 6 months
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		httpOnly: false, // client needs to read it for Sentry gating
	})
}

/**
 * Check if consent has been granted for a specific category.
 */
export function hasConsent(
	consent: ConsentState | null,
	category: ConsentCategory,
): boolean {
	if (!consent) return false
	return consent.granted.includes(category)
}

/**
 * Create a consent state with the current timestamp and given categories.
 * Pass empty array for refused-all.
 */
export function createConsentState(
	granted: ConsentCategory[],
): ConsentState {
	return {
		timestamp: new Date().toISOString(),
		granted,
	}
}
