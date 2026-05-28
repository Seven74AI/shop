import { type NextFunction, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'

/**
 * Express middleware that attaches a unique request ID (UUID v4) to every
 * incoming request. The ID is stored on `req.requestId` and also set as the
 * `X-Request-Id` response header for traceability across services.
 *
 * Must be registered BEFORE any logging middleware so that logs emitted
 * during the request lifecycle include the requestId.
 */
export function requestIdMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const id = randomUUID()
	req.requestId = id
	res.setHeader('X-Request-Id', id)
	next()
}

// Augment Express Request to carry the requestId.
declare global {
	namespace Express {
		interface Request {
			requestId: string
		}
	}
}
