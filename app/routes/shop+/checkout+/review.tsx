import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { data, Link, redirect, redirectDocument, useActionData, useLoaderData } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Field, ErrorList } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getCheckoutData, calculateCartVat } from '#app/utils/checkout.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { useIsPending } from '#app/utils/misc.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { CouponCodeSchema, couponErrorMessages } from '#app/schemas/coupon.ts'
import { validateCoupon } from '#app/utils/coupon.server.ts'
import { type Route } from './+types/review.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const checkoutData = await getCheckoutData(request)

	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	// Calculate VAT estimate using merchant country as default
	// (actual VAT will be computed at payment time with real shipping country)
	let vatEstimate = null
	try {
		vatEstimate = await calculateCartVat(
			checkoutData.cart,
			checkoutData.defaultShippingAddress?.country || 'FR',
		)
	} catch {
		// VAT calculation failure shouldn't block checkout
	}

	// Read coupon code from URL params (when returning from a later step)
	const url = new URL(request.url)
	const couponCode = url.searchParams.get('couponCode') || undefined

	return {
		cart: checkoutData.cart,
		currency: checkoutData.currency,
		subtotal: checkoutData.subtotal,
		vatEstimate,
		couponCode,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: CouponCodeSchema,
	})

	if (submission.status !== 'success') {
		// No coupon code entered — just continue to shipping
		return redirect('/shop/checkout/shipping')
	}

	const { couponCode } = submission.value

	// Get checkout data to validate against
	const checkoutData = await getCheckoutData(request)
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	// Validate the coupon against the order
	const result = await validateCoupon(couponCode, checkoutData.subtotal)

	if (!result.valid) {
		return data(
			{
				result: submission.reply({
					formErrors: [couponErrorMessages[result.reason]],
				}),
				couponCode,
			},
			{ status: 400 },
		)
	}

	// Coupon is valid — redirect to shipping with coupon code in URL
	return redirect(`/shop/checkout/shipping?couponCode=${encodeURIComponent(couponCode)}`)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./review.lazy')
