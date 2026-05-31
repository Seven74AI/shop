import * as Sentry from '@sentry/react-router'
import { useCallback, useEffect, useState } from 'react'
import { redirect, redirectDocument, useFetcher, useRevalidator } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { fulfillOrder } from '#app/utils/fulfillment.server.ts'
import {
	getOrderByCheckoutSessionId,
	createOrderFromStripeSession,
} from '#app/utils/order.server.ts'
import { type StoreAddress } from '#app/utils/shipment.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/success.ts'

export async function loader({ request }: Route.LoaderArgs) {
	try {
		const url = new URL(request.url)
		const sessionId = url.searchParams.get('session_id')

		if (!sessionId) {
			// No session_id - redirect to shop
			return redirect('/shop')
		}

		// Wait 1.5 seconds for webhook to process (webhooks are usually very fast)
		await new Promise((resolve) => setTimeout(resolve, 1500))

		// Check database for order by session_id (webhook creates it)
		let order
		try {
			order = await getOrderByCheckoutSessionId(sessionId)
		} catch (error) {
			// Log error but don't fail - show processing state instead
			Sentry.captureException(error, {
				tags: { context: 'checkout-success-loader' },
				extra: { sessionId },
			})
			order = null
		}

		if (order) {
			// Order exists - redirect to order detail using redirectDocument to replace history
			const userId = await getUserId(request)
			// For authenticated users, redirect directly
			if (userId) {
				const redirectUrl = `/shop/orders/${order.orderNumber}`
				return redirectDocument(redirectUrl)
			}
			// For guests, redirect with email parameter
			const redirectUrl = `/shop/orders/${order.orderNumber}?email=${encodeURIComponent(order.email)}`
			return redirectDocument(redirectUrl)
		}

		// Order doesn't exist yet - return processing state
		// DO NOT redirect - let the component handle the processing state
		return {
			processing: true,
			sessionId,
			message: 'Your order is being processed. Please wait a moment.',
		}
	} catch (error) {
		// Log error but still return processing state for user
		Sentry.captureException(error, {
			tags: { context: 'checkout-success-loader' },
		})
		// Return error state but still render something
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
		// Verify payment status from Stripe before creating order
		const session = await stripe.checkout.sessions.retrieve(sessionId)
		
		if (session.payment_status !== 'paid') {
			return {
				error: 'Payment not completed',
				message: `Payment status: ${session.payment_status}. Please contact support if you were charged.`,
			}
		}

		// Create order using shared function (includes cart deletion)
		const order = await createOrderFromStripeSession(sessionId, session, request)

		// Fulfill order (create shipments, etc.) - non-blocking
		// Don't fail sync if fulfillment fails - it can be retried manually
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
			// Log fulfillment errors but don't fail sync
			// Order was created successfully, fulfillment can be retried
			Sentry.captureException(fulfillmentError, {
				tags: { context: 'checkout-success-sync-fulfillment' },
				extra: {
					orderId: order.id,
					orderNumber: order.orderNumber,
					sessionId,
				},
			})
		}

		// Return success with order number and email for redirect
		return {
			success: true,
			orderNumber: order.orderNumber,
			email: session.customer_email || session.metadata?.email || null,
		}
	} catch (error) {
		// Log error to Sentry for critical failures
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

// Lazy-load admin route component for code splitting
export const lazy = () => import('./success.lazy')
