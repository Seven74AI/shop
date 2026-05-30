import pino from 'pino'

const IS_DEV = process.env.NODE_ENV === 'development'
const IS_TEST = process.env.NODE_ENV === 'test'

/**
 * Pino logger instance.
 *
 * - In development: uses pino-pretty for human-readable output with colors.
 * - In production: outputs structured JSON (parseable by log aggregators).
 * - In test: uses a silent stream to suppress log noise during test runs.
 *
 * Usage:
 *   import { log } from '#app/utils/logging.server'
 *   log.info({ orderId: 'abc' }, 'Order processed')
 */
export const log = pino({
	level: IS_TEST ? 'silent' : IS_DEV ? 'debug' : 'info',
	...(IS_DEV
		? {
				transport: {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:HH:MM:ss.l',
						ignore: 'pid,hostname',
					},
				},
			}
		: {}),
})

/**
 * Create a request-scoped child logger with a requestId attached.
 * Call this once per request in middleware or route handlers.
 *
 * Usage:
 *   const reqLog = createRequestLogger(requestId)
 *   reqLog.info({ path: '/checkout' }, 'Processing checkout')
 */
export function createRequestLogger(requestId: string) {
	return log.child({ requestId })
}

/**
 * Asynchronously flush pending log writes.
 * Call before process exit to ensure logs aren't lost.
 */
export async function flushLogs() {
	await new Promise<void>((resolve) => {
		log.flush()
		// pino.flush() is synchronous when using pino-pretty transport,
		// but we wrap in a microtask to give the stream time to drain.
		setTimeout(resolve, 100)
	})
}

/**
 * Extract the requestId from an Express request object, falling back to a
 * scoped identifier. Safe to call in utility modules that receive the request
 * object (or undefined for non-request contexts).
 */
export function getRequestLogger(request?: { requestId?: string }) {
	return request?.requestId ? log.child({ requestId: request.requestId }) : log
}
