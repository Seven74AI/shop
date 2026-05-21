import type { RequestHandler } from 'express'
import { isFlagEnabled } from '#app/utils/flag.server.ts'

/**
 * Express middleware that gates a route behind a feature flag.
 * Returns 404 (Not Found) if the flag is not enabled, so the route is
 * invisible to clients rather than returning a 403/401 that reveals
 * the existence of the endpoint.
 *
 * @example
 *   import { requireFlag } from '#app/utils/feature-flags.server.ts'
 *   app.get('/admin/experimental', requireFlag('experimental_feature'), handler)
 */
export function requireFlag(key: string): RequestHandler {
	return async (_req, res, next) => {
		const enabled = await isFlagEnabled(key)
		if (!enabled) {
			return res.status(404).send('Not found')
		}
		next()
	}
}
