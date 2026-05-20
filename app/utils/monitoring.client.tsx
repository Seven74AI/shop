import * as Sentry from '@sentry/react-router'

export function init() {
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
			Sentry.replayIntegration({
				// --- PII Masking Configuration ---
				// Mask all text content by default (safest for e-commerce)
				maskAllText: true,
				// Mask all input values (passwords, emails, addresses, etc.)
				maskAllInputs: true,
				// Block all media elements (images may contain profile photos, etc.)
				blockAllMedia: true,

				// Unmask non-PII UI elements that are useful for debugging:
				// navigation, product info, buttons, status messages
				unmaskTextSelector:
					[
						// Structural / navigation (no PII)
						'nav',
						'header',
						'footer',
						// Interactive elements
						'button',
						'a[href]',
						// Product info (public catalog data)
						'[data-sentry-unmask]',
						// Status, alerts, toasts (useful for debugging)
						'[role="alert"]',
						'[role="status"]',
						// Headings (structural, rarely PII)
						'h1',
						'h2',
						'h3',
						'h4',
						'h5',
						'h6',
					].join(', '),

				// Block sensitive form elements from being recorded at all
				blockSelector:
					[
						// Password fields
						'input[type="password"]',
						// Credit card / payment fields
						'input[name*="card"]',
						'input[name*="cvc"]',
						'input[name*="cvv"]',
						// Any element explicitly marked as sensitive
						'[data-sentry-block]',
					].join(', '),
			}),
			Sentry.browserProfilingIntegration(),
		],

		// Set tracesSampleRate to 1.0 to capture 100%
		// of transactions for performance monitoring.
		// We recommend adjusting this value in production
		tracesSampleRate: 1.0,

		// Capture Replay for 10% of all sessions,
		// plus for 100% of sessions with an error
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
	})
}
