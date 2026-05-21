import { redirectDocument } from 'react-router'
import { getUserId } from '#app/utils/auth.server.ts'
import { getCartSessionIdFromRequest } from '#app/utils/cart-session.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/_index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	
	// Check if cart exists and has items - redirect early if not
	const userId = await getUserId(request)
	let cart = null
	
	if (userId) {
		cart = await prisma.cart.findFirst({
			where: { userId },
			include: { items: true },
		})
	} else {
		const sessionId = await getCartSessionIdFromRequest(request)
		if (sessionId) {
			cart = await prisma.cart.findFirst({
				where: { sessionId },
				include: { items: true },
			})
		}
	}
	
	if (!cart || cart.items.length === 0) {
		return redirectDocument('/shop/cart')
	}
	
	// Redirect to success page if session_id is present
	const sessionId = url.searchParams.get('session_id')
	if (sessionId) {
		return redirectDocument(`/shop/checkout/success?session_id=${sessionId}`)
	}
	
	// Redirect to review step (first step of multi-step checkout)
	return redirectDocument('/shop/checkout/review')
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Checkout' },
]
