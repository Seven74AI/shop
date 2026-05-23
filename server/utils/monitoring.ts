import { PrismaInstrumentation } from '@prisma/instrumentation'
import { nodeProfilingIntegration } from '@sentry/profiling-node'
import * as Sentry from '@sentry/react-router'
import {
	createBeforeSendHook,
	createBeforeSendTransactionHook,
} from '../../app/utils/sentry-pii.server.ts'

export function init() {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.NODE_ENV,
		denyUrls: [
			/\/resources\/healthcheck/,
			// TODO: be smarter about the public assets...
			/\/build\//,
			/\/favicons\//,
			/\/img\//,
			/\/fonts\//,
			/\/favicon.ico/,
			/\/site\.webmanifest/,
		],
		integrations: [
			Sentry.prismaIntegration({
				prismaInstrumentation: new PrismaInstrumentation(),
			}),
			Sentry.httpIntegration(),
			nodeProfilingIntegration(),
		],
		tracesSampler(samplingContext) {
			// ignore healthcheck transactions by other services (consul, etc.)
			if (samplingContext.request?.url?.includes('/resources/healthcheck')) {
				return 0
			}
			return process.env.NODE_ENV === 'production' ? 1 : 0
		},
		beforeSendTransaction(event, _hint) {
			// ignore all healthcheck related transactions
			//  note that name of header here is case-sensitive
			if (event.request?.headers?.['x-healthcheck'] === 'true') {
				return null
			}

			// Strip PII from transaction data
			const piiHook = createBeforeSendTransactionHook()
			return piiHook(event) as any
		},
		beforeSend(event, _hint) {
			// Strip PII from error events
			const piiHook = createBeforeSendHook()
			return piiHook(event) as any
		},
	})
}
