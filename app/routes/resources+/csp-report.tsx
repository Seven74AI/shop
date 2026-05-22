import { type Route } from './+types/csp-report.ts'

/**
 * CSP Report Endpoint — POST /resources/csp-report
 *
 * Receives Content-Security-Policy violation reports from browsers.
 * Reports are logged for monitoring and can be forwarded to Sentry in production.
 *
 * Browsers send reports with Content-Type: application/csp-report
 * containing a JSON body with the violation details.
 *
 * Returns 204 No Content per the CSP reporting specification.
 */
export async function action({ request }: Route.ActionArgs) {
	// CSP reports are always POST
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 })
	}

	// Read the raw body — browsers send application/csp-report content type
	// which cannot be parsed by standard JSON body parsers
	try {
		const rawBody = await request.text()
		if (!rawBody) {
			return new Response(null, { status: 204 })
		}

		const report = JSON.parse(rawBody) as { 'csp-report'?: Record<string, unknown> }
		const cspReport = report['csp-report']

		if (cspReport) {
			const violation = {
				'document-uri': cspReport['document-uri'],
				'referrer': cspReport['referrer'],
				'violated-directive': cspReport['violated-directive'],
				'effective-directive': cspReport['effective-directive'],
				'blocked-uri': cspReport['blocked-uri'],
				'line-number': cspReport['line-number'],
				'source-file': cspReport['source-file'],
				'script-sample': cspReport['script-sample'],
			}

			// In production, forward to Sentry for monitoring
			if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
				console.warn(
					'CSP Violation:',
					JSON.stringify(violation),
				)
			} else {
				console.warn(
					'CSP Violation:',
					cspReport['violated-directive'],
					cspReport['blocked-uri'],
				)
			}
		}
	} catch (error) {
		// Silently ignore malformed reports — don't leak error info to the client
		console.error('Failed to parse CSP report:', error)
	}

	// 204 No Content — the browser doesn't need a response body
	return new Response(null, { status: 204 })
}

/**
 * GET is not supported on this endpoint.
 * CSP reports are always sent via POST.
 */
export async function loader() {
	return new Response('Method not allowed', { status: 405 })
}
