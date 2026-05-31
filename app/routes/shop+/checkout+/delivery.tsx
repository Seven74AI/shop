import { getFormProps, getInputProps, useForm, useInputControl } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { useEffect, useState } from 'react'
import { Form, redirect, redirectDocument, useLoaderData } from 'react-router'
import { useTranslation } from '#app/utils/i18n.tsx'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { MondialRelayPickupSelector } from '#app/components/shipping/mondial-relay-pickup-selector.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { getShippingCost, getShippingMethodsForCountry } from '#app/utils/shipping.server.ts'
import { type Route } from './+types/delivery.ts'

const DeliveryFormSchema = z.object({
	shippingMethodId: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z.string({
			error: (issue) =>
				issue.input === undefined ? 'Shipping method is required' : 'Not a string',
		}).min(1, { error: 'Shipping method is required' }),
	),
	mondialRelayPickupPointId: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z.string().optional(),
	),
})

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	
	// Get address data from URL params
	const name = url.searchParams.get('name')
	const email = url.searchParams.get('email')
	const street = url.searchParams.get('street')
	const city = url.searchParams.get('city')
	const state = url.searchParams.get('state')
	const postal = url.searchParams.get('postal')
	const country = url.searchParams.get('country')

	// Validate required address fields
	if (!name || !email || !street || !city || !postal || !country) {
		return redirectDocument('/shop/checkout/shipping')
	}

	// Get checkout data for cart summary
	const checkoutData = await getCheckoutData(request)
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	// Get shipping methods for the country
	const shippingMethods = await getShippingMethodsForCountry(country.toUpperCase())

	return {
		cart: checkoutData.cart,
		currency: checkoutData.currency,
		subtotal: checkoutData.subtotal,
		shippingInfo: {
			name,
			email,
			street,
			city,
			state: state || undefined,
			postal,
			country,
		},
		shippingMethods,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const url = new URL(request.url)
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: DeliveryFormSchema,
	})

	if (submission.status !== 'success') {
		return redirect(url.pathname + url.search)
	}

	// Get address data from URL params
	const name = url.searchParams.get('name')
	const email = url.searchParams.get('email')
	const street = url.searchParams.get('street')
	const city = url.searchParams.get('city')
	const state = url.searchParams.get('state')
	const postal = url.searchParams.get('postal')
	const country = url.searchParams.get('country')

	// Validate required address fields
	if (!name || !email || !street || !city || !postal || !country) {
		return redirect('/shop/checkout/shipping')
	}

	const shippingMethodId = submission.value.shippingMethodId
	const mondialRelayPickupPointId = submission.value.mondialRelayPickupPointId || ''

	// Get coupon code from URL params (not in the form schema)
	const couponCode = url.searchParams.get('couponCode') || undefined

	// Get cart for weight calculation
	const { cart } = await getOrCreateCartFromRequest(request)
	invariantResponse(cart, 'Cart not found', { status: 404 })

	const cartWithItems = await prisma.cart.findUnique({
		where: { id: cart.id },
		include: {
			items: {
				include: {
					product: {
						select: {
							price: true,
							weightGrams: true,
						},
					},
					variant: {
						select: {
							price: true,
							weightGrams: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(cartWithItems, 'Cart not found', { status: 404 })

	const currency = await getStoreCurrency()
	invariantResponse(currency, 'Currency not configured', { status: 500 })

	const subtotal = cartWithItems.items.reduce((sum, item) => {
		const price = item.variant?.price ?? item.product.price
		return sum + (price ?? 0) * item.quantity
	}, 0)

	const DEFAULT_WEIGHT_GRAMS = 500
	const totalWeightGrams = cartWithItems.items.reduce((sum, item) => {
		const itemWeight =
			item.variant?.weightGrams ??
			item.product.weightGrams ??
			DEFAULT_WEIGHT_GRAMS
		return sum + itemWeight * item.quantity
	}, 0)

	const shippingCost = await getShippingCost(
		shippingMethodId,
		subtotal,
		totalWeightGrams,
	)

	// Redirect to payment step with all data
	return redirect(
		`/shop/checkout/payment?` +
		`name=${encodeURIComponent(name)}&` +
		`email=${encodeURIComponent(email)}&` +
		`street=${encodeURIComponent(street)}&` +
		`city=${encodeURIComponent(city)}&` +
		`state=${encodeURIComponent(state || '')}&` +
		`postal=${encodeURIComponent(postal)}&` +
		`country=${encodeURIComponent(country)}&` +
		`shippingMethodId=${encodeURIComponent(shippingMethodId)}&` +
		`shippingCost=${shippingCost}&` +
		`mondialRelayPickupPointId=${encodeURIComponent(mondialRelayPickupPointId)}` +
		`${couponCode ? `&couponCode=${encodeURIComponent(couponCode)}` : ''}`
	)
}

export const meta: Route.MetaFunction = () => [{ title: 'Delivery | Checkout' }]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./delivery.lazy')
