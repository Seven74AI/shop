import { createId } from '@paralleldrive/cuid2'
import { type NextFunction, type Request, type Response } from 'express'
import { logger } from './logger.server.js'

const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Express middleware that extracts or generates a request ID, attaches it
 * to the request and response, and creates a per-request child logger.
 *
 * - If the incoming request has an `x-request-id` header, it's reused for
 *   distributed tracing across services.
 * - Otherwise, a new CUID2 id is generated.
 * - The request ID is set on `req.requestId`, included in every log line
 *   from `req.log`, and echoed back in the `x-request-id` response header.
 */
export function requestIdMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const existingId = req.get(REQUEST_ID_HEADER)
	const requestId = existingId ?? createId()

	// Attach to request for downstream use
	req.requestId = requestId

	// Echo back in response header for propagation
	res.set(REQUEST_ID_HEADER, requestId)

	// Create a per-request child logger with requestId bound
	req.log = logger.child({ requestId })

	next()
}
