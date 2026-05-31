import { useEffect, type ReactElement } from 'react'
import {
	type ErrorResponse,
	isRouteErrorResponse,
	useParams,
	useRouteError,
} from 'react-router'
import { getErrorMessage } from '#app/utils/misc'

type StatusHandler = (info: {
	error: ErrorResponse
	params: Record<string, string | undefined>
}) => ReactElement | null

export function GeneralErrorBoundary({
	defaultStatusHandler = ({ error }) => (
		<p>
			{error.status} {error.data}
		</p>
	),
	statusHandlers,
	unexpectedErrorHandler = (error) => <p>{getErrorMessage(error)}</p>,
}: {
	defaultStatusHandler?: StatusHandler
	statusHandlers?: Record<number, StatusHandler>
	unexpectedErrorHandler?: (error: unknown) => ReactElement | null
}) {
	const error = useRouteError()
	const params = useParams()
	const isResponse = isRouteErrorResponse(error)

	useEffect(() => {
		// Only load Sentry on the client when SENTRY_DSN is configured.
		// Dynamic import avoids bundling the 80KB+ Sentry client SDK into
		// every page — it only loads when an error boundary actually fires.
		if (typeof window === 'undefined' || !window.ENV?.SENTRY_DSN) return

		void import('@sentry/react-router').then(({ captureException }) => {
			if (isResponse) {
				captureException(error, {
					tags: {
						context: 'error-boundary',
						errorType: 'route-error-response',
						status: error.status,
					},
					extra: {
						status: error.status,
						data: error.data,
						params,
					},
				})
			} else {
				captureException(error, {
					tags: {
						context: 'error-boundary',
						errorType: 'unexpected-error',
					},
					extra: { params },
				})
			}
		})
	}, [error, isResponse, params])

	return (
		<div className="text-h2 container flex items-center justify-center p-20">
			{isResponse
				? (statusHandlers?.[error.status] ?? defaultStatusHandler)({
						error,
						params,
					})
				: unexpectedErrorHandler(error)}
		</div>
	)
}
