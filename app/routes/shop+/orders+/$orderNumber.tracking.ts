import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { getUserId } from '#app/utils/auth.server.ts'
import { verifyGuestOrderToken } from '#app/utils/guest-order-token.server.ts'
import { getOrderByOrderNumber } from '#app/utils/order-queries.server.ts'
import { getMondialRelayTrackingInfo } from '#app/utils/tracking.server.ts'
import { type Route } from './+types/$orderNumber.tracking.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	const { orderNumber } = params
	const userId = await getUserId(request)
	const url = new URL(request.url)

	// Support both new signed token and legacy email query param
	const token = url.searchParams.get('token')
	const email = url.searchParams.get('email')

	// Get order
	const order = await getOrderByOrderNumber(orderNumber)
	invariantResponse(order, 'Order not found', { status: 404 })

	// Authorization check
	if (order.userId) {
		invariantResponse(userId === order.userId, 'Unauthorized', { status: 403 })
	} else {
		// Guest order - require verification via token or email
		if (token) {
			const tokenPayload = verifyGuestOrderToken(token)
			invariantResponse(tokenPayload, 'Invalid or expired order access token', { status: 403 })
			invariantResponse(
				tokenPayload.orderNumber === orderNumber,
				'Token does not match order',
				{ status: 403 },
			)
			invariantResponse(
				tokenPayload.email === order.email.toLowerCase(),
				'Token does not match order',
				{ status: 403 },
			)
		} else if (email) {
			// Legacy email-based verification
			invariantResponse(
				email.toLowerCase() === order.email.toLowerCase(),
				'Email does not match order',
				{ status: 403 },
			)
		} else {
			invariantResponse(false, 'Access token required to view guest order', { status: 400 })
		}
	}

	// Check if order has Mondial Relay shipment
	if (!order.mondialRelayShipmentNumber) {
		return data(
			{
				error: 'Order does not have a Mondial Relay shipment',
			},
			{ status: 400 },
		)
	}

	try {
		const trackingInfo = await getMondialRelayTrackingInfo(order.id)
		return data({ trackingInfo })
	} catch (error) {
		console.error('Error fetching tracking info:', error)
		return data(
			{
				error: 'Failed to fetch tracking information',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 },
		)
	}
}

