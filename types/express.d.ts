import { type Logger } from 'pino'

declare global {
	namespace Express {
		interface Request {
			/** Unique request identifier for distributed tracing */
			requestId: string
			/** Per-request child logger with requestId bound */
			log: Logger
		}
	}
}

export {}
