import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link, data } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Switch } from '#app/components/ui/switch.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { FlagSchema } from '#app/schemas/flag.ts'
import { prisma } from '#app/utils/db.server.ts'
import { invalidateFlagCache } from '#app/utils/flag.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$key.edit.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const flag = await prisma.flag.findUnique({
		where: { key: params.key },
	})

	invariantResponse(flag, 'Flag not found', { status: 404 })

	return { flag }
}

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: FlagSchema.superRefine(async (data, ctx) => {
			// Check key uniqueness (excluding current)
			if (data.key !== params.key) {
				const existing = await prisma.flag.findUnique({
					where: { key: data.key },
				})
				if (existing) {
					ctx.addIssue({
						code: 'custom',
						message: 'A flag with this key already exists',
						path: ['key'],
					})
				}
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

	const { key, enabled, rolloutPercentage, audience, description } =
		submission.value

	// If key changed, delete old + create new
	if (key !== params.key) {
		await prisma.flag.delete({ where: { key: params.key } })
		await prisma.flag.create({
			data: {
				key,
				enabled,
				rolloutPercentage: rolloutPercentage ?? 0,
				audience: audience || null,
				description: description || null,
			},
		})
	} else {
		await prisma.flag.update({
			where: { key: params.key },
			data: {
				enabled,
				rolloutPercentage: rolloutPercentage ?? 0,
				audience: audience || null,
				description: description || null,
			},
		})
	}

	invalidateFlagCache()
	return redirectWithToast('/admin/flags', {
		description: `Flag "${key}" updated`,
	})
}

export const meta: Route.MetaFunction = ({ data }) => [
	{ title: `Edit ${data?.flag.key ?? 'Flag'} | Admin | Epic Shop` },
	{ name: 'description', content: `Edit feature flag: ${data?.flag.key}` },
]

export default function EditFlag({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { flag } = loaderData
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'flag-edit-form',
		constraint: getZodConstraint(FlagSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FlagSchema })
		},
		defaultValue: {
			key: flag.key,
			enabled: flag.enabled ? 'true' : 'false',
			rolloutPercentage: String(flag.rolloutPercentage ?? 0),
			audience: flag.audience ?? '',
			description: flag.description ?? '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Edit Flag
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Update feature flag: <code className="font-mono">{flag.key}</code>
					</p>
				</div>
				<Button
					asChild
					variant="outline"
					className="transition-all duration-200 hover:shadow-sm"
				>
					<Link to="/admin/flags">
						<Icon name="arrow-left" className="mr-2 h-4 w-4" />
						Back to Flags
					</Link>
				</Button>
			</div>

			<FormProvider context={form.context}>
				<Form method="POST" className="space-y-8" {...getFormProps(form)}>
					<Card className="transition-shadow duration-200 hover:shadow-md rounded-[14px]">
						<CardHeader>
							<h2 className="text-xl">Flag Configuration</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-6 md:grid-cols-2">
								<div className="space-y-3">
									<Label htmlFor={fields.key.id} className="text-sm font-medium">
										Key *
									</Label>
									<Input
										{...getInputProps(fields.key, { type: 'text' })}
										placeholder="new_feature"
										className="font-mono"
									/>
									{fields.key.errors?.map((e) => (
										<p key={e} className="text-xs text-destructive">
											{e}
										</p>
									))}
								</div>

								<div className="space-y-3">
									<Label
										htmlFor={fields.rolloutPercentage.id}
										className="text-sm font-medium"
									>
										Rollout Percentage (0-100)
									</Label>
									<Input
										{...getInputProps(fields.rolloutPercentage, {
											type: 'number',
										})}
										min={0}
										max={100}
									/>
									{fields.rolloutPercentage.errors?.map((e) => (
										<p key={e} className="text-xs text-destructive">
											{e}
										</p>
									))}
								</div>
							</div>

							<div className="space-y-3">
								<Label
									htmlFor={fields.description.id}
									className="text-sm font-medium"
								>
									Description
								</Label>
								<Textarea
									{...getTextareaProps(fields.description)}
									placeholder="What does this flag control?"
									rows={2}
								/>
							</div>

							<div className="space-y-3">
								<Label
									htmlFor={fields.audience.id}
									className="text-sm font-medium"
								>
									Audience Filter (JSON)
								</Label>
								<Textarea
									{...getTextareaProps(fields.audience)}
									placeholder='{"userIds":["user_123"],"countries":["FR","BE"],"roles":["admin"]}'
									rows={4}
									className="font-mono text-sm"
								/>
							</div>

							<div className="flex items-center gap-3">
								<Label
									htmlFor={fields.enabled.id}
									className="text-sm font-medium"
								>
									Enabled
								</Label>
								<input
									type="hidden"
									name={fields.enabled.name}
									value="false"
								/>
								<Switch
									id={fields.enabled.id}
									name={fields.enabled.name}
									defaultChecked={flag.enabled}
									onCheckedChange={(checked) => {
										const el = document.querySelector(
											`input[name="${fields.enabled.name}"][type="hidden"]`,
										) as HTMLInputElement
										if (el) el.value = checked ? 'true' : 'false'
									}}
								/>
							</div>
						</CardContent>
					</Card>

					<div className="flex items-center justify-end space-x-4">
						<Button
							type="button"
							variant="outline"
							asChild
							className="transition-all duration-200 hover:shadow-sm"
						>
							<Link to="/admin/flags">Cancel</Link>
						</Button>
						<Button
							type="submit"
							disabled={isPending}
							className="transition-all duration-200 hover:shadow-md"
						>
							{isPending ? 'Saving...' : 'Save Changes'}
						</Button>
					</div>
				</Form>
			</FormProvider>
		</div>
	)
}
