import { useCallback, useEffect, useState } from 'react'
import { redirect, redirectDocument, useFetcher, useRevalidator } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { useTranslation } from '#app/utils/i18n.tsx'
import { type Route } from './+types/success.ts'




export default function CheckoutSuccess({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation()
	// Ensure we have the required data with defaults
	const processing = loaderData?.processing ?? false
	const sessionId = loaderData?.sessionId ?? null
	const message = loaderData?.message ?? 'Your order is being processed. Please wait a moment.'

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

	// Auto-refresh if order is processing
	useEffect(() => {
		if (!processing || !sessionId) return
		
		// If fallback already triggered, don't start polling again
		if (hasTriggeredFallback) return

		// Check if we should trigger fallback immediately (if page has been open for > 15 seconds)
		const elapsedSincePageLoad = Date.now() - pageLoadTime
		if (elapsedSincePageLoad >= 15000) {
			setShowSyncButton(true)
			setHasTriggeredFallback(true)
			handleSyncOrder()
			return
		}

		// Set max polling duration (15 seconds before fallback)
		const maxPollingDuration = 15000 // 15 seconds
		const startTime = Date.now()
		
		const interval = setInterval(() => {
			const elapsed = Date.now() - startTime
			if (elapsed >= maxPollingDuration) {
				clearInterval(interval)
				setShowSyncButton(true)
				setHasTriggeredFallback(true)
				// Automatically trigger fallback sync
				handleSyncOrder()
				return
			}
			void revalidator.revalidate()
		}, 3000) // Check every 3 seconds

		return () => clearInterval(interval)
	}, [processing, sessionId, revalidator, hasTriggeredFallback, handleSyncOrder, pageLoadTime])

	// Handle sync fetcher response
	useEffect(() => {
		if (syncFetcher.data?.success && syncFetcher.data.orderNumber) {
			// Redirect to order detail page
			// For guests, include email in URL if available
			let redirectUrl = `/shop/orders/${syncFetcher.data.orderNumber}`
			if (syncFetcher.data.email) {
				redirectUrl += `?email=${encodeURIComponent(syncFetcher.data.email)}`
			}
			window.location.href = redirectUrl
		} else if (syncFetcher.data?.error) {
			// Error is already displayed in UI, no need to log
		}
	}, [syncFetcher.data])

	const isSyncing = syncFetcher.state !== 'idle'
	const syncError = syncFetcher.data?.error
	
	// Show sync button if we've been processing for more than 15 seconds
	const shouldShowSyncButton = showSyncButton || (processing && (Date.now() - pageLoadTime) >= 15000)
	
	return (
		<div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[calc(100vh-200px)]">
			<Card className="w-full max-w-[672px] rounded-[10px] border border-[#D1D5DC] shadow-[0px_1px_2px_-1px_rgba(0,0,0,0.1),0px_1px_3px_0px_rgba(0,0,0,0.1)] bg-white">
				<CardContent className="pt-16 pb-16 px-12 text-center">
					{/* Loading Icon */}
					<div className="flex justify-center mb-6">
						<Icon
							name="update"
							className={`h-[68px] w-[68px] ${isSyncing ? 'animate-spin' : ''} text-[#101828]`}
						/>
					</div>
					
					{/* Heading */}
					<h1 className="text-base font-normal text-[#101828] mb-4 leading-[1.5em]">
						{isSyncing ? t('shop.checkout.success.creating') : t('shop.checkout.success.title')}
					</h1>
					
					{/* Message */}
					<p className="text-base font-normal text-[#4A5565] mb-6 leading-[1.5em]">
						{isSyncing
							? t('shop.checkout.success.paymentSuccess')
							: message}
					</p>
					
					{/* Error Message */}
					{syncError && (
						<div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
							<p className="text-destructive font-medium mb-2">Error: {syncError}</p>
							<p className="text-sm text-muted-foreground">
								{syncFetcher.data?.message || 'Please contact support with your session ID.'}
							</p>
						</div>
					)}
					
					{/* Sync Button (shown after timeout) */}
					{shouldShowSyncButton && !isSyncing && (
						<div className="mb-6">
							<Button
								onClick={handleSyncOrder}
								disabled={isSyncing}
								className="h-9 px-4 rounded-lg font-medium border border-[#D1D5DC] bg-white text-[#101828] hover:bg-gray-50"
							>
								<Icon name="update" className="mr-2 h-4 w-4" />
								{t('shop.checkout.success.syncButton')}
							</Button>
						</div>
					)}
					
					{/* Refresh Button */}
					{!shouldShowSyncButton && !isSyncing && (
						<div className="mb-6">
							<Button
								variant="outline"
								onClick={() => {
									void revalidator.revalidate()
								}}
								className="h-9 px-4 rounded-lg font-medium border border-[#D1D5DC] bg-white text-[#101828] hover:bg-gray-50"
							>
								{t('shop.checkout.success.refreshButton')}
							</Button>
						</div>
					)}
					
					{/* Cart Info */}
				<p className="text-sm font-normal text-[#4A5565] mb-4 leading-[1.4285714285714286em]">
					{t('shop.checkout.success.cartInfo')}
				</p>
					
					{/* Session ID */}
					{sessionId && (
						<p className="text-sm font-normal text-[#6A7282] leading-[1.4285714285714286em]">
							{t('shop.checkout.success.sessionIdLabel')} {sessionId.substring(0, 20)}...
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

export function ErrorBoundary() {
	const { t } = useTranslation()
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="container mx-auto px-4 py-16">
						<Card className="max-w-2xl mx-auto border-primary/50 bg-primary/5">
							<CardContent className="pt-12 pb-12 text-center">
								<Icon name="question-mark-circled" className="h-16 w-16 text-primary mx-auto mb-6" />
					<h1 className="text-3xl font-bold mb-4">{t('shop.checkout.success.pageNotFoundTitle')}</h1>
					<p className="text-muted-foreground mb-6">
						{t('shop.checkout.success.pageNotFound')}
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
					<h1 className="text-3xl font-bold mb-4">{t('shop.checkout.success.errorTitle')}</h1>
					<p className="text-muted-foreground mb-6">
						{t('shop.checkout.success.errorMessage')}
					</p>
						</CardContent>
					</Card>
				</div>
			)}
		/>
	)
}
