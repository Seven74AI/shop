import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form } from 'react-router'
import { useTranslation } from '#app/utils/i18n.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { FlagSchema } from '#app/schemas/flag.ts'
import { prisma } from '#app/utils/db.server.ts'
import { invalidateFlagCache } from '#app/utils/flag.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/new.ts'

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: FlagSchema,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const { key, enabled, rolloutPercentage, audience, description } = submission.value

	// Check for duplicate key
	const existing = await prisma.flag.findUnique({ where: { key } })
	if (existing) {
		return {
			result: submission.reply({
				fieldErrors: {
					key: ['A flag with this key already exists'],
				},
			}),
		}
	}

	await prisma.flag.create({
		data: {
			key,
			enabled,
			rolloutPercentage,
			audience: audience || null,
			description: description || null,
		},
	})

	invalidateFlagCache()

	return redirectWithToast(`/admin/feature-flags`, {
		type: 'success',
		description: `Feature flag "${key}" created successfully`,
	})
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	return {}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'New Feature Flag | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new feature flag' },
]

function FlagForm({ actionData, t }: { actionData?: Route.ComponentProps['actionData']; t: ReturnType<typeof import('#app/utils/i18n.tsx').useTranslation>['t'] }) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'flag-form',
		constraint: getZodConstraint(FlagSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FlagSchema })
		},
		defaultValue: {
			key: '',
			enabled: '',
			rolloutPercentage: '0',
			audience: '',
			description: '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FormProvider context={form.context}>
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">{t('admin.flags.form.flagInfo')}</h2>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-3">
							<Label htmlFor={fields.key.id} className="text-sm font-medium">
								{t('admin.flags.form.flagKeyRequired')}
							</Label>
							<Input
								{...getInputProps(fields.key, { type: 'text' })}
								placeholder="e.g., new_checkout_flow"
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 font-mono"
							/>
							<p className="text-xs text-muted-foreground">
								{t('admin.flags.form.flagKeyHelp')}
							</p>
							<ErrorList errors={fields.key.errors} />
						</div>

						<div className="space-y-3">
							<Label htmlFor={fields.description.id} className="text-sm font-medium">
								{t('admin.flags.form.description')}
							</Label>
							<Textarea
								{...getTextareaProps(fields.description)}
								placeholder={t('admin.flags.form.descriptionPlaceholder')}
								rows={2}
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							/>
							<ErrorList errors={fields.description.errors} />
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.rolloutPercentage.id} className="text-sm font-medium">
									{t('admin.flags.form.rolloutPercentage')}
								</Label>
								<Input
									{...getInputProps(fields.rolloutPercentage, { type: 'number' })}
									placeholder="0"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									{t('admin.flags.form.rolloutHelp')}
								</p>
								<ErrorList errors={fields.rolloutPercentage.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.audience.id} className="text-sm font-medium">
									{t('admin.flags.form.audience')}
								</Label>
								<Input
									{...getInputProps(fields.audience, { type: 'text' })}
									placeholder='{"userIds":[],"countries":[],"roles":[]}'
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 font-mono text-sm"
								/>
								<p className="text-xs text-muted-foreground">
									{t('admin.flags.form.audienceHelp')}
								</p>
								<ErrorList errors={fields.audience.errors} />
							</div>
						</div>

						<div className="flex items-center space-x-2">
							<input
								{...getInputProps(fields.enabled, { type: 'checkbox' })}
								className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
							/>
							<Label htmlFor={fields.enabled.id} className="text-sm font-medium cursor-pointer">
								{t('admin.flags.form.enabledHelp')}
							</Label>
						</div>
						<ErrorList errors={fields.enabled.errors} />
					</CardContent>
				</Card>

				{/* Actions */}
				<div className="flex items-center justify-end space-x-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => window.history.back()}
						className="transition-all duration-200 hover:shadow-sm"
					>
						{t('admin.flags.cancel')}
					</Button>
					<Button
						type="submit"
						disabled={isPending}
						className="transition-all duration-200 hover:shadow-md"
					>
						{isPending ? t('admin.flags.form.creating') : t('admin.flags.form.createAction')}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./__new.lazy')
