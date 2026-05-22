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

export default function EditReview({ loaderData, actionData }: Route.ComponentProps) {
	const { review } = loaderData

	const [form, fields] = useForm({
		id: 'edit-review-form',
		lastResult: actionData?.result,
		defaultValue: {
			title: review.title ?? '',
			body: review.body ?? '',
			rating: review.rating,
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: EditReviewSchema })
		},
	})

	return (
		<div className="space-y-8 animate-slide-top max-w-2xl">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					Edit Review
				</h1>
				<Link
					to={`/admin/reviews/${review.id}`}
					className="text-sm text-muted-foreground hover:underline"
				>
					<Icon name="arrow-left" className="h-3 w-3 inline mr-1" />
					Back to review
				</Link>
			</div>

			{/* Review context */}
			<Card className="rounded-[14px]">
				<CardHeader>
					<CardTitle className="text-base font-normal">Review Context</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-2 text-sm">
						<dt className="text-muted-foreground">Product</dt>
						<dd>{review.product.name}</dd>
						<dt className="text-muted-foreground">User</dt>
						<dd>{review.user?.name || review.user?.username || 'Anonymous'}</dd>
					</dl>
				</CardContent>
			</Card>

			{/* Edit Form */}
			<Card className="rounded-[14px]">
				<CardHeader>
					<CardTitle className="text-base font-normal">Edit Review Content</CardTitle>
				</CardHeader>
				<CardContent>
					<Form method="POST" {...getFormProps(form)} className="space-y-6">
						<div className="space-y-2">
							<Label htmlFor={fields.rating.id}>Rating</Label>
							<StarRatingInput
								name={fields.rating.name}
								defaultValue={review.rating}
							/>
							{fields.rating.errors && (
								<ErrorList id={fields.rating.errorId} errors={fields.rating.errors} />
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor={fields.title.id}>Title</Label>
							<Input
								{...getInputProps(fields.title, { type: 'text' })}
								placeholder="Review title"
							/>
							{fields.title.errors && (
								<ErrorList id={fields.title.errorId} errors={fields.title.errors} />
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor={fields.body.id}>Body</Label>
							<Textarea
								{...getTextareaProps(fields.body)}
								placeholder="Review content"
								rows={6}
							/>
							{fields.body.errors && (
								<ErrorList id={fields.body.errorId} errors={fields.body.errors} />
							)}
						</div>

						<div className="flex items-center justify-between">
							<Button variant="outline" asChild>
								<Link to={`/admin/reviews/${review.id}`}>Cancel</Link>
							</Button>
							<Button type="submit">
								<Icon name="pencil-1" className="h-4 w-4 mr-1" />
								Save Changes
							</Button>
						</div>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}

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

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon name="lock-closed" className="h-12 w-12 text-muted-foreground" />
						<h2 className="text-xl font-semibold">Unauthorized</h2>
						<p className="text-muted-foreground text-center">
							{typeof error.data === 'object' && error.data && 'message' in error.data
								? String(error.data.message)
								: 'You do not have permission to access this page.'}
						</p>
						<Button asChild>
							<Link to="/admin">Back to Dashboard</Link>
						</Button>
					</div>
				),
				404: () => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon name="file-text" className="h-12 w-12 text-muted-foreground" />
						<h2 className="text-xl font-semibold">Review Not Found</h2>
						<p className="text-muted-foreground">
							The review you are looking for does not exist.
						</p>
						<Button asChild>
							<Link to="/admin/reviews">Back to Reviews</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}
