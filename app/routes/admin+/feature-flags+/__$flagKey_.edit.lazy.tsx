import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
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
import { type Route } from './+types/$flagKey_.edit.ts'

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: FlagSchema.omit({ key: true }),
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const { enabled, rolloutPercentage, audience, description } = submission.value

	const flag = await prisma.flag.findUnique({ where: { key: params.flagKey } })
	invariantResponse(flag, 'Feature flag not found', { status: 404 })

	await prisma.flag.update({
		where: { key: params.flagKey },
		data: {
			enabled,
			rolloutPercentage,
			audience: audience || null,
			description: description || null,
		},
	})

	invalidateFlagCache()

	return redirectWithToast(`/admin/feature-flags`, {
		type: 'success',
		description: `Feature flag "${params.flagKey}" updated successfully`,
	})
}

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const flag = await prisma.flag.findUnique({ where: { key: params.flagKey } })
	invariantResponse(flag, 'Feature flag not found', { status: 404 })

	return { flag }
}

export const meta: Route.MetaFunction = ({ data }) => [
	{ title: `Edit ${(data as { flag: { key: string } })?.flag.key ?? 'Feature Flag'} | Admin | Epic Shop` },
	{ name: 'description', content: 'Edit feature flag settings' },
]

function EditFlagForm({
	flag,
	actionData,
	t,
}: {
	flag: Route.ComponentProps['loaderData']['flag']
	actionData?: Route.ComponentProps['actionData']
	t: ReturnType<typeof import('#app/utils/i18n.tsx').useTranslation>['t']
}) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'edit-flag-form',
		constraint: getZodConstraint(FlagSchema.omit({ key: true })),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FlagSchema.omit({ key: true }) })
		},
		defaultValue: {
			enabled: flag.enabled ? 'on' : '',
			rolloutPercentage: String(flag.rolloutPercentage ?? 0),
			audience: flag.audience ?? '',
			description: flag.description ?? '',
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
						{/* Key is read-only */}
						<div className="space-y-3">
							<Label className="text-sm font-medium">{t('admin.flags.form.flagKey')}</Label>
							<Input
								value={flag.key}
								disabled
								className="font-mono bg-muted"
							/>
							<p className="text-xs text-muted-foreground">
								{t('admin.flags.form.flagKeyImmutable')}
							</p>
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
									{t('admin.flags.form.rolloutHelpEdit')}
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
								{t('admin.flags.form.enabledHelpEdit')}
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
						{isPending ? t('admin.flags.form.saving') : t('admin.flags.form.saveAction')}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

export default function EditFeatureFlag({ loaderData, actionData }: Route.ComponentProps) {
	const { t } = useTranslation()
	const { flag } = loaderData

	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					{t('admin.flags.edit.title')}
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{t('admin.flags.edit.description', { key: flag.key })}
				</p>
			</div>

			<EditFlagForm flag={flag} actionData={actionData} t={t} />
		</div>
	)
}
