import { redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { markRecovered } from '#app/utils/abandoned-cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { verifyRecoveryToken } from '#app/utils/recovery-token.server.ts'
import { type Route } from './+types/recover-cart.ts'

const TOKEN_PARAM = 'token'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const token = url.searchParams.get(TOKEN_PARAM)

	if (!token) {
		return { status: 'missing-token' as const }
	}

	const payload = verifyRecoveryToken(token)
	if (!payload) {
		return { status: 'invalid-token' as const }
	}

	const { cartId, userId } = payload

	// Verify cart exists, still has items, and belongs to the user
	const cart = await prisma.cart.findFirst({
		where: {
			id: cartId,
			userId,
			items: { some: {} },
		},
		select: { id: true },
	})

	if (!cart) {
		return { status: 'cart-not-found' as const }
	}

	// Mark the recovery email as recovered
	await markRecovered(token)

	// Redirect to the cart page
	return redirect('/shop/cart')
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Recover Your Cart | Epic Shop' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

export default function RecoverCartRoute({
	loaderData,
}: Route.ComponentProps) {
	if (loaderData.status === 'missing-token') {
		return (
			<div className="container py-20 text-center">
				<h1 className="text-h1 mb-4">Missing Recovery Link</h1>
				<p className="text-body-md text-muted-foreground">
					No recovery token was provided. Please use the link from your
					email.
				</p>
			</div>
		)
	}

	if (loaderData.status === 'invalid-token') {
		return (
			<div className="container py-20 text-center">
				<h1 className="text-h1 mb-4">Invalid Link</h1>
				<p className="text-body-md text-muted-foreground">
					This recovery link is invalid or has expired. Your cart items
					may still be available — try visiting your cart directly.
				</p>
			</div>
		)
	}

	if (loaderData.status === 'cart-not-found') {
		return (
			<div className="container py-20 text-center">
				<h1 className="text-h1 mb-4">Cart Not Found</h1>
				<p className="text-body-md text-muted-foreground">
					Your cart may have been cleared or the items may have been
					purchased already. Visit our store to browse new products.
				</p>
			</div>
		)
	}

	// Should never reach here — the loader redirects on success
	return null
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
