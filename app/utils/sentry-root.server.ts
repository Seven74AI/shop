import * as Sentry from '@sentry/react-router'

/**
 * Server-only Sentry wrapper for root loader.
 * Keeps @sentry/react-router out of the client bundle — only imported
 * by entry.server and server-side route resolution.
 */
export function captureRootError(userId: string, error: unknown, context: string) {
	Sentry.captureException(error, {
		tags: { context },
		extra: { userId },
	})
}

export function captureRootMessage(message: string, context: string, extra?: Record<string, unknown>) {
	Sentry.captureMessage(message, {
		level: 'warning',
		tags: { context },
		extra,
	})
}
