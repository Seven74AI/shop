/**
 * Cookie consent categories as defined by CNIL guidelines.
 * - necessary: strictly required for the site to function (always granted)
 * - analytics: performance monitoring, error tracking (Sentry)
 * - marketing: advertising and marketing cookies (not currently used but reserved)
 */
export const CONSENT_CATEGORIES = ['analytics', 'marketing'] as const
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number]

export type ConsentState = {
	/** ISO timestamp of when consent was given */
	timestamp: string
	/** Which categories the user has consented to */
	granted: ConsentCategory[]
}

/**
 * Check if any consent decision has been made (user has either accepted or refused).
 * Used to determine whether to show the banner. Pure function — safe for client/server.
 */
export function hasConsentDecision(consent: ConsentState | null): boolean {
	return consent !== null
}
