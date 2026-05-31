import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data, Form, useActionData } from 'react-router'
import { z } from 'zod'
import { Field, TextareaField } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { ReviewSubmissionSchema } from '#app/schemas/review.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useTranslation } from '#app/utils/i18n.tsx'
import { useIsPending } from '#app/utils/misc.tsx'
import { submitReview } from '#app/utils/review.server.ts'

import type { Route } from './+types/products.$slug.reviews.ts'

/**
 * Load the product to confirm it exists. Guests are allowed to view
 * the review form but must log in to submit.
 */
export async function loader({ params }: Route.LoaderArgs) {
	const product = await prisma.product.findUnique({
		where: { slug: params.slug },
		select: { id: true, name: true, slug: true },
	})

	invariantResponse(product, 'Product not found', { status: 404 })

	return { product }
}

const ReviewFormSchema = z.object({
	intent: z.enum(['submit-review']),
	rating: z.coerce.number({
		error: 'Rating is required',
	}),
	title: z.string().min(1, 'Title is required'),
	body: z.string().min(1, 'Review body is required'),
})

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	const product = await prisma.product.findUnique({
		where: { slug: params.slug },
		select: { id: true },
	})
	invariantResponse(product, 'Product not found', { status: 404 })

	const formData = await request.formData()

	const submission = await parseWithZod(formData, {
		schema: ReviewFormSchema.transform(async (input, ctx) => {
			try {
				const result = await submitReview({
					userId,
					productId: product.id,
					rating: input.rating,
					title: input.title,
					body: input.body,
				})
				return result
			} catch (error) {
				ctx.addIssue({
					code: 'custom',
					message:
						error instanceof Error
							? error.message
							: 'Failed to submit review',
				})
				return z.NEVER
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	return data({
		result: submission.reply(),
		status: 'success' as const,
		review: submission.value,
	})
}

export default function ProductReviews({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const { t } = useTranslation()
	const { product } = loaderData

	const [form, fields] = useForm({
		id: 'review-form',
		constraint: getZodConstraint(ReviewSubmissionSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ReviewSubmissionSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	// Show success message after review submitted
	if (actionData && 'status' in actionData && actionData.status === 'success') {
		return (
			<main className="container mx-auto px-4 py-8 max-w-lg">
				<div className="rounded-lg border bg-card p-6 text-center">
					<h1 className="text-2xl font-bold mb-4">{t('reviews.submitted')}</h1>
					<p className="text-muted-foreground mb-2">
						{t('reviews.thankYou')}{' '}
						<span className="font-semibold">{product.name}</span>.
					</p>
					<p className="text-sm text-muted-foreground">
						{t('reviews.pendingApproval')}
					</p>
				</div>
			</main>
		)
	}

	return (
		<main className="container mx-auto px-4 py-8 max-w-lg">
			<h1 className="text-3xl font-bold mb-2">{t('reviews.title')}</h1>
			<p className="text-muted-foreground mb-8">
				{t('reviews.shareExperience')}{' '}
				<span className="font-semibold">{product.name}</span>.
			</p>

			<Form method="POST" {...getFormProps(form)}>
				<input type="hidden" name="intent" value="submit-review" />

				<Field
					labelProps={{ children: t('reviews.rating') }}
					inputProps={{
						...getInputProps(fields.rating, { type: 'number' }),
						min: 1,
						max: 5,
						step: 1,
						placeholder: t('reviews.ratingPlaceholder'),
					}}
					errors={fields.rating.errors}
				/>

				<Field
					labelProps={{ children: t('reviews.titleLabel') }}
					inputProps={{
						...getInputProps(fields.title, { type: 'text' }),
						placeholder: t('reviews.titlePlaceholder'),
					}}
					errors={fields.title.errors}
				/>

				<TextareaField
					labelProps={{ children: t('reviews.reviewLabel') }}
					textareaProps={{
						...getInputProps(fields.body, { type: 'text' }),
						placeholder: t('reviews.reviewPlaceholder'),
						rows: 6,
					}}
					errors={fields.body.errors}
				/>

				<div className="mt-6">
					<StatusButton
						className="w-full"
						status={
							isPending
								? 'pending'
								: (form.status ?? 'idle')
						}
						type="submit"
						disabled={isPending}
					>
						{t('reviews.submit')}
					</StatusButton>
				</div>
			</Form>
		</main>
	)
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	const product = loaderData?.product
	if (!product) return [{ title: 'Reviews | Shop | Epic Shop' }]
	return [{ title: `Review ${product.name} | Shop | Epic Shop` }]
}
