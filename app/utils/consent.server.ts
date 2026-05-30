import * as cookie from 'cookie'
import { COOKIE_NAME } from '#app/utils/consent-constants.ts'
export { COOKIE_NAME }

export type ConsentPreferences = {
	necessary: boolean
	analytics: boolean
	marketing: boolean
}

/**
 * Minimal consent — necessary cookies only, everything else declined.
 * Used as the default when no consent has been given.
 */
export const DEFAULT_CONSENT: ConsentPreferences = {
	necessary: true,
	analytics: false,
	marketing: false,
}

/**
 * Validate that a parsed object is a valid ConsentPreferences.
 * necessary must be true for consent to be valid (GDPR: necessary cookies
 * are always allowed, but we validate the shape).
 */
function isValidConsent(value: unknown): value is ConsentPreferences {
	if (typeof value !== 'object' || value === null) return false
	const obj = value as Record<string, unknown>
	if (typeof obj.necessary !== 'boolean') return false
	if (!obj.necessary) return false // necessary must always be true
	if (typeof obj.analytics !== 'boolean') return false
	if (typeof obj.marketing !== 'boolean') return false
	return true
}

/**
 * Parse the consent cookie from the request.
 * Returns null if no valid consent cookie is present.
 */
export function parseConsentCookie(
	request: Request,
): ConsentPreferences | null {
	const cookieHeader = request.headers.get('cookie')
	if (!cookieHeader) return null

	const parsed = cookie.parse(cookieHeader)
	const raw = parsed[COOKIE_NAME]
	if (!raw) return null

	try {
		const value = JSON.parse(raw)
		if (isValidConsent(value)) {
			return value
		}
		return null
	} catch {
		return null
	}
}

/**
 * Check whether the request has a valid consent cookie.
 */
export function hasConsentCookie(request: Request): boolean {
	return parseConsentCookie(request) !== null
}

/**
 * Serialize consent preferences to a Set-Cookie header value.
 * Cookie expires after 1 year. cookie.serialize handles URL-encoding.
 */
export function setConsentCookie(preferences: ConsentPreferences): string {
	return cookie.serialize(
		COOKIE_NAME,
		JSON.stringify(preferences),
		{
			path: '/',
			maxAge: 365 * 24 * 60 * 60, // 1 year
			sameSite: 'lax',
		},
	)
}
