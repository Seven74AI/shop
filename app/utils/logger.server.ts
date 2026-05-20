import pino from 'pino'

const IS_PROD = process.env.NODE_ENV === 'production'
const LOG_LEVEL = process.env.LOG_LEVEL ?? (IS_PROD ? 'info' : 'debug')

export const logger = pino({
	level: LOG_LEVEL,
	...(IS_PROD
		? {}
		: {
				transport: {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:HH:MM:ss.l',
						ignore: 'pid,hostname',
					},
				},
			}),
	redact: {
		paths: [
			'password',
			'passwordHash',
			'token',
			'secret',
			'authorization',
			'cookie',
			'set-cookie',
			'req.headers.cookie',
			'req.headers.authorization',
			'req.headers["set-cookie"]',
			'res.headers["set-cookie"]',
		],
		censor: '[REDACTED]',
	},
})
