import crypto from 'node:crypto'
import { PassThrough } from 'node:stream'
import { styleText } from 'node:util'
import { contentSecurity } from '@nichtsam/helmet/content'
import { createReadableStreamFromReadable } from '@react-router/node'
import * as Sentry from '@sentry/react-router'
import { isbot } from 'isbot'
import { renderToPipeableStream } from 'react-dom/server'
import {
	ServerRouter,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
	type HandleDocumentRequestFunction,
} from 'react-router'
import { getEnv, init } from './utils/env.server.ts'
import { getInstanceInfo } from './utils/litefs.server.ts'
import { log } from './utils/logging.server.ts'
import { NonceProvider } from './utils/nonce-provider.ts'
import { makeTimings } from './utils/timing.server.ts'

export const streamTimeout = 5000

init()
global.ENV = getEnv()

const MODE = process.env.NODE_ENV ?? 'development'

type DocRequestArgs = Parameters<HandleDocumentRequestFunction>

export default async function handleRequest(...args: DocRequestArgs) {
	const [request, responseStatusCode, responseHeaders, reactRouterContext] =
		args
	const { currentInstance, primaryInstance } = await getInstanceInfo()
	responseHeaders.set('fly-region', process.env.FLY_REGION ?? 'unknown')
	responseHeaders.set('fly-app', process.env.FLY_APP_NAME ?? 'unknown')
	responseHeaders.set('fly-primary-instance', primaryInstance)
	responseHeaders.set('fly-instance', currentInstance)

	if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
		responseHeaders.append('Document-Policy', 'js-profiling')
	}

	const callbackName = isbot(request.headers.get('user-agent'))
		? 'onAllReady'
		: 'onShellReady'

	const nonce = crypto.randomBytes(16).toString('hex')
	return new Promise(async (resolve, reject) => {
		let didError = false
		// NOTE: this timing will only include things that are rendered in the shell
		// and will not include suspended components and deferred loaders
		const timings = makeTimings('render', 'renderToPipeableStream')

		const { pipe, abort } = renderToPipeableStream(
			<NonceProvider value={nonce}>
				<ServerRouter
					nonce={nonce}
					context={reactRouterContext}
					url={request.url}
				/>
			</NonceProvider>,
			{
				[callbackName]: () => {
					const body = new PassThrough()
					responseHeaders.set('Content-Type', 'text/html')
					responseHeaders.append('Server-Timing', timings.toString())

				contentSecurity(responseHeaders, {
					crossOriginEmbedderPolicy: false,
					contentSecurityPolicy: {
						reportOnly: false,
						directives: {
							fetch: {
								'default-src': ["'self'"],
								'connect-src': [
									MODE === 'development' ? 'ws:' : undefined,
									process.env.SENTRY_DSN ? '*.sentry.io' : undefined,
									"'self'",
									'https://api.stripe.com',
								],
								'font-src': ["'self'"],
								'frame-src': [
									"'self'",
									'https://*.stripe.com',
								],
								'img-src': ["'self'", 'data:', 'https://*.stripe.com'],
								'media-src': ["'self'"],
								'object-src': ["'none'"],
								'script-src': [
									"'strict-dynamic'",
									"'unsafe-eval'",
									"'self'",
									`'nonce-${nonce}'`,
									'https://js.stripe.com',
								],
								'script-src-attr': [`'nonce-${nonce}'`],
								'style-src': ["'self'", "'unsafe-inline'"],
								'style-src-attr': ["'unsafe-inline'"],
							},
							document: {
								'base-uri': ["'self'"],
							},
							navigation: {
								'form-action': ["'self'"],
							},
							deprecated: {
								'report-uri': '/resources/csp-report',
							},
							other: {
								'upgrade-insecure-requests': true,
							},
						},
					},
				})

					resolve(
						new Response(createReadableStreamFromReadable(body), {
							headers: responseHeaders,
							status: didError ? 500 : responseStatusCode,
						}),
					)
					pipe(body)
				},
				onShellError: (err: unknown) => {
					reject(err)
				},
				onError: () => {
					didError = true
				},
				nonce,
			},
		)

		setTimeout(abort, streamTimeout + 5000)
	})
}

export async function handleDataRequest(response: Response) {
	const { currentInstance, primaryInstance } = await getInstanceInfo()
	response.headers.set('fly-region', process.env.FLY_REGION ?? 'unknown')
	response.headers.set('fly-app', process.env.FLY_APP_NAME ?? 'unknown')
	response.headers.set('fly-primary-instance', primaryInstance)
	response.headers.set('fly-instance', currentInstance)

	return response
}

export function handleError(
	error: unknown,
	{ request }: LoaderFunctionArgs | ActionFunctionArgs,
): void {
	// Skip capturing if the request is aborted as Remix docs suggest
	// Ref: https://remix.run/docs/en/main/file-conventions/entry.server#handleerror
	if (request.signal.aborted) {
		return
	}

	// Log to Sentry with context
	Sentry.captureException(error, {
		tags: {
			context: 'server-error-handler',
		},
		extra: {
			url: request.url,
			method: request.method,
		},
	})

	// Also log to console in development for local debugging
	if (process.env.NODE_ENV === 'development') {
		if (error instanceof Error) {
			log.error({ err: error, stack: error.stack }, 'Server error')
		} else {
			log.error({ err: error }, 'Server error')
		}
	}
}
