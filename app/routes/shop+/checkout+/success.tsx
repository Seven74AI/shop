import * as Sentry from '@sentry/react-router'
import { useCallback, useEffect, useState } from 'react'
import { redirect, redirectDocument, useFetcher, useRevalidator } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { fulfillOrder } from '#app/utils/fulfillment.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import {
	createOrderFromStripeSession,
	getOrderByCheckoutSessionId,
} from '#app/utils/order.server.ts'
import { type StoreAddress } from '#app/utils/shipment.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/success.ts'

export async function loader({ request }: Route.LoaderArgs) {
	try {
		const url = new URL(request.url)
		const sessionId = url.searchParams.get('session_id')

		if (!sessionId) {
			return redirect('/shop')
		}

		await new Promise((resolve) => setTimeout(resolve, 1500))

		let order
		try {
			order = await getOrderByCheckoutSessionId(sessionId)
		} catch (error) {
			Sentry.captureException(error, {
				tags: { context: 'checkout-success-loader' },
				extra: { sessionId },
			})
			order = null
		}

		if (order) {
			const userId = await getUserId(request)
			if (userId) {
				const redirectUrl = `/shop/orders/${order.orderNumber}`
				return redirectDocument(redirectUrl)
			}
			const redirectUrl = `/shop/orders/${order.orderNumber}?email=${encodeURIComponent(order.email)}`
			return redirectDocument(redirectUrl)
		}

		return {
			processing: true,
			sessionId,
			message: 'Your order is being processed. Please wait a moment.',
		}
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'checkout-success-loader' },
		})
		const url = new URL(request.url)
		const sessionId = url.searchParams.get('session_id')
		return {
			processing: true,
			sessionId: sessionId || null,
			message: 'An error occurred while processing your order. Please try refreshing the page.',
		}
	}
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')
	const sessionId = formData.get('session_id')

	if (intent !== 'sync-order' || !sessionId || typeof sessionId !== 'string') {
		return { error: 'Invalid request' }
	}

	try {
		const session = await stripe.checkout.sessions.retrieve(sessionId)

		if (session.payment_status !== 'paid') {
			return {
				error: 'Payment not completed',
				message: `Payment status: ${session.payment_status}. Please contact support if you were charged.`,
			}
		}

		const order = await createOrderFromStripeSession(sessionId, session, request)

		try {
			const storeAddress: StoreAddress = {
				name: process.env.STORE_NAME || 'Store',
				address1: process.env.STORE_ADDRESS1 || '',
				address2: process.env.STORE_ADDRESS2,
				city: process.env.STORE_CITY || '',
				postalCode: process.env.STORE_POSTAL_CODE || '',
				country: process.env.STORE_COUNTRY || 'FR',
				phone: process.env.STORE_PHONE || '',
				email: process.env.STORE_EMAIL,
			}

			await fulfillOrder(order.id, storeAddress)
		} catch (fulfillmentError) {
			Sentry.captureException(fulfillmentError, {
				tags: { context: 'checkout-success-sync-fulfillment' },
				extra: {
					orderId: order.id,
					orderNumber: order.orderNumber,
					sessionId,
				},
			})
		}

		return {
			success: true,
			orderNumber: order.orderNumber,
			email: session.customer_email || session.metadata?.email || null,
		}
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'checkout-success-sync' },
			extra: { sessionId },
		})
		return {
			error: 'Failed to sync order',
			message:
				error instanceof Error
					? error.message
					: 'An error occurred while creating your order. Please contact support with your session ID.',
		}
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Order Processing | Shop | Epic Shop' },
]

export default function CheckoutSuccess({ loaderData }: Route.ComponentProps) {
	const processing = loaderData?.processing ?? false
	const sessionId = loaderData?.sessionId ?? null
	const defaultMessage = loaderData?.message ?? 'Your order is being processed. Please wait a moment.'

	const { t } = useTranslation()
	const message = defaultMessage

	const revalidator = useRevalidator()
	const syncFetcher = useFetcher<typeof action>()
	const [showSyncButton, setShowSyncButton] = useState(false)
	const [hasTriggeredFallback, setHasTriggeredFallback] = useState(false)
	const [pageLoadTime] = useState(() => Date.now())

	const handleSyncOrder = useCallback(() => {
		if (!sessionId) {
			return
		}

		if (syncFetcher.state !== 'idle') {
			return
		}

		const formData = new FormData()
		formData.append('intent', 'sync-order')
		formData.append('session_id', sessionId)
		void syncFetcher.submit(formData, { method: 'POST' })
	}, [sessionId, syncFetcher])

	useEffect(() => {
		if (!processing || !sessionId) return

		if (hasTriggeredFallback) return

		const elapsedSincePageLoad = Date.now() - pageLoadTime
		if (elapsedSincePageLoad >= 15000) {
			setShowSyncButton(true)
			setHasTriggeredFallback(true)
			handleSyncOrder()
			return
		}

		const maxPollingDuration = 15000
		const startTime = Date.now()

		const interval = setInterval(() => {
			const elapsed = Date.now() - startTime
			if (elapsed >= maxPollingDuration) {
				clearInterval(interval)
				setShowSyncButton(true)
				setHasTriggeredFallback(true)
				handleSyncOrder()
				return
			}
			void revalidator.revalidate()
		}, 3000)

		return () => clearInterval(interval)
	}, [processing, sessionId, revalidator, hasTriggeredFallback, handleSyncOrder, pageLoadTime])

	useEffect(() => {
		if (syncFetcher.data?.success && syncFetcher.data.orderNumber) {
			let redirectUrl = `/shop/orders/${syncFetcher.data.orderNumber}`
			if (syncFetcher.data.email) {
				redirectUrl += `?email=${encodeURIComponent(syncFetcher.data.email)}`
			}
			window.location.href = redirectUrl
		} else if (syncFetcher.data?.error) {
			// Error is already displayed in UI
		}
	}, [syncFetcher.data])

	const isSyncing = syncFetcher.state !== 'idle'
	const syncError = syncFetcher.data?.error

	const shouldShowSyncButton = showSyncButton || (processing && (Date.now() - pageLoadTime) >= 15000)

	return (
		<div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[calc(100vh-200px)]">
			<Card className="w-full max-w-[672px] rounded-[10px] border border-[#D1D5DC] shadow-[0px_1px_2px_-1px_rgba(0,0,0,0.1),0px_1px_3px_0px_rgba(0,0,0,0.1)] bg-white">
				<CardContent className="pt-16 pb-16 px-12 text-center">
					<div className="flex justify-center mb-6">
						<Icon
							name="update"
							className={`h-[68px] w-[68px] ${isSyncing ? 'animate-spin' : ''} text-[#101828]`}
						/>
					</div>

					<h1 className="text-base font-normal text-[#101828] mb-4 leading-[1.5em]">
						{isSyncing ? t('checkout.success.creating') : t('checkout.success.processing')}
					</h1>

					<p className="text-base font-normal text-[#4A5565] mb-6 leading-[1.5em]">
						{isSyncing
							? t('checkout.success.paymentSuccessful')
							: message}
					</p>

					{syncError && (
						<div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
							<p className="text-destructive font-medium mb-2">Error: {syncError}</p>
							<p className="text-sm text-muted-foreground">
								{syncFetcher.data?.message || 'Please contact support with your session ID.'}
							</p>
						</div>
					)}

					{shouldShowSyncButton && !isSyncing && (
						<div className="mb-6">
							<Button
								onClick={handleSyncOrder}
								disabled={isSyncing}
								className="h-9 px-4 rounded-lg font-medium border border-[#D1D5DC] bg-white text-[#101828] hover:bg-gray-50"
							>
								<Icon name="update" className="mr-2 h-4 w-4" />
								{t('checkout.success.syncNow')}
							</Button>
						</div>
					)}

					{!shouldShowSyncButton && !isSyncing && (
						<div className="mb-6">
							<Button
								variant="outline"
								onClick={() => {
									void revalidator.revalidate()
								}}
								className="h-9 px-4 rounded-lg font-medium border border-[#D1D5DC] bg-white text-[#101828] hover:bg-gray-50"
							>
								{t('checkout.success.refreshNow')}
							</Button>
						</div>
					)}

					<p className="text-sm font-normal text-[#4A5565] mb-4 leading-[1.4285714285714286em]">
						{t('checkout.success.cartInfo')}
					</p>

					{sessionId && (
						<p className="text-sm font-normal text-[#6A7282] leading-[1.4285714285714286em]">
							Session ID: {sessionId.substring(0, 20)}...
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="container mx-auto px-4 py-16">
						<Card className="max-w-2xl mx-auto border-primary/50 bg-primary/5">
							<CardContent className="pt-12 pb-12 text-center">
								<Icon name="question-mark-circled" className="h-16 w-16 text-primary mx-auto mb-6" />
								<h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
								<p className="text-muted-foreground mb-6">
									The checkout success page could not be found.
								</p>
							</CardContent>
						</Card>
					</div>
				),
			}}
			unexpectedErrorHandler={(_error) => (
				<div className="container mx-auto px-4 py-16">
					<Card className="max-w-2xl mx-auto border-primary/50 bg-primary/5">
						<CardContent className="pt-12 pb-12 text-center">
							<Icon name="question-mark-circled" className="h-16 w-16 text-primary mx-auto mb-6" />
							<h1 className="text-3xl font-bold mb-4">Error Loading Page</h1>
							<p className="text-muted-foreground mb-6">
								An error occurred while loading the checkout success page. Please try again or contact support.
							</p>
						</CardContent>
					</Card>
				</div>
			)}
		/>
	)
}
