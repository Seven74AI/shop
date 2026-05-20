import * as Sentry from '@sentry/react-router'

/**
 * Read the en_consent cookie to check if analytics consent has been granted.
 * This runs early in entry.client.tsx, before React hydrates, so we read
 * document.cookie directly rather than relying on loader data.
 */
function hasAnalyticsConsent(): boolean {
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
			if (Array.isArray(state.granted) && state.granted.includes('analytics')) {
				return true
			}
		}
	} catch {
		// If cookie is malformed or absent, assume no consent
	}
	return false
}

export function init() {
	const analyticsConsent = hasAnalyticsConsent()

	Sentry.init({
		dsn: ENV.SENTRY_DSN,
		environment: ENV.MODE,
		beforeSend(event) {
			if (event.request?.url) {
				const url = new URL(event.request.url)
				if (
					url.protocol === 'chrome-extension:' ||
					url.protocol === 'moz-extension:'
				) {
					// This error is from a browser extension, ignore it
					return null
				}
			}
			return event
		},
		integrations: [
			Sentry.browserProfilingIntegration(),
			// Only enable session replay when user has granted analytics consent
			...(analyticsConsent ? [Sentry.replayIntegration()] : []),
		],

		// Set tracesSampleRate to 1.0 to capture 100%
		// of transactions for performance monitoring.
		// We recommend adjusting this value in production
		tracesSampleRate: 1.0,

		// Only configure replay rates when replay is enabled
		...(analyticsConsent
			? {
					// Capture Replay for 10% of all sessions,
					// plus for 100% of sessions with an error
					replaysSessionSampleRate: 0.1,
					replaysOnErrorSampleRate: 1.0,
				}
			: {}),
	})
}
