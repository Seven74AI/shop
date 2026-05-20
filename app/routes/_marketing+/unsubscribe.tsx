import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Form, useNavigation } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { verifyUnsubscribeToken } from '#app/utils/unsubscribe-token.server.ts'
import { type Route } from './+types/unsubscribe.ts'

const TOKEN_PARAM = 'token'

const UnsubscribeSchema = z.object({
	token: z.string().min(1, 'Token is required'),
})

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const token = url.searchParams.get(TOKEN_PARAM)

	if (!token) {
		return { status: 'missing-token' as const }
	}

	const userId = verifyUnsubscribeToken(token)
	if (!userId) {
		return { status: 'invalid-token' as const }
	}

	return { status: 'valid' as const, token, userId }
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: UnsubscribeSchema })

	if (submission.status !== 'success') {
		return { result: submission.reply(), success: false }
	}

	const { token } = submission.value
	const userId = verifyUnsubscribeToken(token)

	if (!userId) {
		return {
			result: submission.reply({
				formErrors: ['Invalid or expired unsubscribe link.'],
			}),
			success: false,
		}
	}

	// Double-check user exists
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, marketingEmailsEnabled: true },
	})

	if (!user) {
		return {
			result: submission.reply({
				formErrors: ['User not found.'],
			}),
			success: false,
		}
	}

	// Only update if not already unsubscribed (idempotent)
	if (user.marketingEmailsEnabled) {
		await prisma.user.update({
			where: { id: userId },
			data: { marketingEmailsEnabled: false },
		})
	}

	return { result: submission.reply(), success: true }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Unsubscribe | Epic Shop' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

export default function UnsubscribeRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const navigation = useNavigation()
	const isSubmitting = navigation.state === 'submitting'

	const [form, fields] = useForm({
		id: 'unsubscribe-form',
		lastResult: actionData?.result,
	})

	// Already unsubscribed
	if (actionData?.success) {
		return (
			<div className="container py-20 text-center">
				<h1 className="text-h1 mb-4">Unsubscribed</h1>
				<p className="text-body-md text-muted-foreground">
					You have been successfully unsubscribed from marketing emails. You
					will no longer receive promotional content.
				</p>
			</div>
		)
	}

	// Invalid or missing token
	if (
		loaderData.status === 'missing-token' ||
		loaderData.status === 'invalid-token'
	) {
		return (
			<div className="container py-20 text-center">
				<h1 className="text-h1 mb-4">Invalid Link</h1>
				<p className="text-body-md text-muted-foreground">
					This unsubscribe link is invalid or has expired. If you believe
					this is an error, please contact support.
				</p>
			</div>
		)
	}

	// Valid token — show confirmation
	return (
		<div className="container py-20 max-w-md mx-auto text-center">
			<h1 className="text-h1 mb-4">Unsubscribe</h1>
			<p className="text-body-md text-muted-foreground mb-8">
				Are you sure you want to unsubscribe from marketing emails? You will
				no longer receive promotions, news, or special offers.
			</p>

			<Form method="POST" {...getFormProps(form)}>
				<input
					{...getInputProps(fields.token, { type: 'hidden' })}
					value={loaderData.token}
				/>
				<ErrorList errors={form.errors} id={form.errorId} />

				<div className="flex gap-4 justify-center">
					<StatusButton
						type="submit"
						status={isSubmitting ? 'pending' : (form.status ?? 'idle')}
						disabled={isPending}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						Unsubscribe
					</StatusButton>
				</div>
			</Form>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
