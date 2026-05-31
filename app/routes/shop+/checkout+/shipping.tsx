import { getFormProps, getInputProps, useForm, useInputControl } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { useEffect, useState } from 'react'
import { data, Form, Link, redirect, redirectDocument, useActionData, useLoaderData } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { useTranslation } from '#app/utils/i18n.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/shipping.ts'

const ShippingFormSchema = z.object({
	addressId: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z.string().optional(),
	),
	saveAddress: z.preprocess(
		(val) => {
			return val === 'on' || val === true
		},
		z.boolean().default(false),
	),
	label: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string()
			.max(50, { error: 'Label must be less than 50 characters' })
			.trim()
			.optional(),
	),
	name: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Name is required' : 'Not a string',
			})
			.min(1, { error: 'Name is required' })
			.max(100, { error: 'Name must be less than 100 characters' })
			.trim(),
	),
	email: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Email is required' : 'Not a string',
			})
			.trim()
			.toLowerCase()
			.min(1, { error: 'Email is required' })
			.pipe(z.email({ error: 'Invalid email address' })),
	),
	street: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined
						? 'Street address is required'
						: 'Not a string',
			})
			.min(1, { error: 'Street address is required' })
			.max(200, { error: 'Street address must be less than 200 characters' })
			.trim(),
	),
	city: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'City is required' : 'Not a string',
			})
			.min(1, { error: 'City is required' })
			.max(100, { error: 'City must be less than 100 characters' })
			.trim(),
	),
	state: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string()
			.max(100, { error: 'State must be less than 100 characters' })
			.trim()
			.optional(),
	),
	postal: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined
						? 'Postal code is required'
						: 'Not a string',
			})
			.min(1, { error: 'Postal code is required' })
			.max(20, { error: 'Postal code must be less than 20 characters' })
			.trim(),
	),
	country: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Country is required' : 'Not a string',
			})
			.trim()
			.toUpperCase()
			.refine((val) => val.length === 2, {
				error: 'Country must be a 2-letter ISO code (e.g., US, GB)',
			}),
	),
})

export async function loader({ request }: Route.LoaderArgs) {
	const checkoutData = await getCheckoutData(request)
	
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	// Get coupon code from URL params
	const url = new URL(request.url)
	const couponCode = url.searchParams.get('couponCode') || undefined

	return { ...checkoutData, couponCode }
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const url = new URL(request.url)
	const submission = parseWithZod(formData, {
		schema: ShippingFormSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const shippingData = submission.value
	const userId = await getUserId(request)

	// Get coupon code from URL params (not in the form schema)
	const couponCode = url.searchParams.get('couponCode') || undefined

	// If addressId is provided, load the saved address
	let finalShippingData = shippingData
	if (shippingData.addressId && userId) {
		const savedAddress = await prisma.address.findUnique({
			where: {
				id: shippingData.addressId,
				userId,
			},
		})

		if (savedAddress) {
			finalShippingData = {
				...shippingData,
				name: savedAddress.name,
				street: savedAddress.street,
				city: savedAddress.city,
				state: savedAddress.state || undefined,
				postal: savedAddress.postal,
				country: savedAddress.country,
			}
		}
	}

	// If saveAddress is checked and no addressId (new address), save it
	const isNewAddress = !shippingData.addressId || shippingData.addressId === '' || shippingData.addressId === 'new'
	
	if (shippingData.saveAddress === true && isNewAddress && userId) {
		const existingAddress = await prisma.address.findFirst({
			where: {
				userId,
				name: shippingData.name,
				street: shippingData.street,
				city: shippingData.city,
				postal: shippingData.postal,
				country: shippingData.country,
			},
		})

		if (!existingAddress) {
			await prisma.address.create({
				data: {
					userId,
					name: shippingData.name,
					street: shippingData.street,
					city: shippingData.city,
					state: shippingData.state || null,
					postal: shippingData.postal,
					country: shippingData.country,
					label: shippingData.label || null,
					type: 'SHIPPING',
					isDefaultShipping: false,
					isDefaultBilling: false,
				},
			})
		}
	}

	// Redirect to delivery step with address information only
	return redirect(
		`/shop/checkout/delivery?` +
		`name=${encodeURIComponent(finalShippingData.name)}&` +
		`email=${encodeURIComponent(finalShippingData.email)}&` +
		`street=${encodeURIComponent(finalShippingData.street)}&` +
		`city=${encodeURIComponent(finalShippingData.city)}&` +
		`state=${encodeURIComponent(finalShippingData.state || '')}&` +
		`postal=${encodeURIComponent(finalShippingData.postal)}&` +
		`country=${encodeURIComponent(finalShippingData.country)}` +
		`${couponCode ? `&couponCode=${encodeURIComponent(couponCode)}` : ''}`
	)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./shipping.lazy')
