import { getFormProps, getInputProps, getTextareaProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { cn } from '#app/utils/misc.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$reviewId_.edit.ts'

const EditReviewSchema = z.object({
	title: z.string().optional(),
	body: z.string().optional(),
	rating: z.number({ error: 'Rating is required' }).int().min(1).max(5),
})

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const review = await prisma.review.findUnique({
		where: { id: params.reviewId },
		select: {
			id: true,
			title: true,
			body: true,
			rating: true,
			isApproved: true,
			rejectionReason: true,
			product: {
				select: { id: true, name: true },
			},
			user: {
				select: { id: true, name: true, username: true },
			},
		},
	})

	if (!review) {
		throw data({ message: 'Review not found' }, { status: 404 })
	}

	return { review }
}

export async function action({ request, params }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: EditReviewSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: 400 },
		)
	}

	const { title, body, rating } = submission.value

	await prisma.review.update({
		where: { id: params.reviewId },
		data: {
			title: title || null,
			body: body || null,
			rating,
		},
	})

	return redirectWithToast(`/admin/reviews/${params.reviewId}`, {
		type: 'success',
		title: 'Review updated',
		description: 'The review content has been updated.',
	})
}

export const meta: Route.MetaFunction = ({ data }) => [
	{ title: `Edit Review | Admin | Epic Shop` },
]


function StarRatingInput({ name, defaultValue }: { name: string; defaultValue: number }) {
	return (
		<div className="flex items-center gap-1">
			{Array.from({ length: 5 }, (_, i) => {
				const value = i + 1
				return (
					<label
						key={i}
						className="cursor-pointer"
						aria-label={`${value} star${value !== 1 ? 's' : ''}`}
					>
						<input
							type="radio"
							name={name}
							value={value}
							defaultChecked={value === defaultValue}
							className="sr-only"
						/>
						<Icon
							name="star"
							className={cn(
								'h-6 w-6 transition-colors',
								value <= defaultValue
									? 'text-yellow-400 fill-yellow-400'
									: 'text-muted-foreground/30',
								'hover:text-yellow-400 hover:fill-yellow-400',
							)}
						/>
					</label>
				)
			})}
		</div>
	)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$reviewId_.edit.lazy')
