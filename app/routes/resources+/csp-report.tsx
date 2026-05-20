import * as Sentry from '@sentry/react-router'
import { type Route } from 'react-router'

export async function action({ request }: Route.ActionArgs) {
	try {
		const body = await request.json()
		// Forward CSP violation report to Sentry
		void Sentry.captureMessage('CSP violation', {
			level: 'warning',
			tags: { context: 'csp-report' },
			extra: body,
		})
	} catch {
		// Malformed JSON - ignore
	}
	// Always return 200 to avoid report loops
	return Response.json({ received: true }, { status: 200 })
}
