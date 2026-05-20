import { useForm, getFormProps, getInputProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link, useFetcher, data } from 'react-router'
import { invariant } from '@epic-web/invariant'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Switch } from '#app/components/ui/switch.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { FlagSchema } from '#app/schemas/flag.ts'
import { prisma } from '#app/utils/db.server.ts'
import { invalidateFlagCache } from '#app/utils/flag.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const flags = await prisma.flag.findMany({
		orderBy: { updatedAt: 'desc' },
	})

	return { flags }
}

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const key = formData.get('key')
		invariant(typeof key === 'string', 'key must be a string')
		await prisma.flag.delete({ where: { key } })
		invalidateFlagCache()
		return redirectWithToast('/admin/flags', {
			description: `Flag "${key}" deleted`,
		})
	}

	if (intent === 'toggle') {
		const key = formData.get('key')
		invariant(typeof key === 'string', 'key must be a string')
		const flag = await prisma.flag.findUnique({ where: { key } })
		if (!flag) {
			return data({ error: 'Flag not found' }, { status: 404 })
		}
		await prisma.flag.update({
			where: { key },
			data: { enabled: !flag.enabled },
		})
		invalidateFlagCache()
		return redirectWithToast('/admin/flags', {
			description: `Flag "${key}" ${flag.enabled ? 'disabled' : 'enabled'}`,
		})
	}

	// Create intent
	const submission = await parseWithZod(formData, {
		schema: FlagSchema.superRefine(async (data, ctx) => {
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
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const { key, enabled, rolloutPercentage, audience, description } =
		submission.value

	await prisma.flag.create({
		data: {
			key,
			enabled,
			rolloutPercentage: rolloutPercentage ?? 0,
			audience: audience || null,
			description: description || null,
		},
	})
	invalidateFlagCache()

	return redirectWithToast('/admin/flags', {
		description: `Flag "${key}" created`,
	})
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Feature Flags | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage feature flags' },
]

function NewFlagForm({
	actionData,
}: {
	actionData?: Route.ComponentProps['actionData']
}) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'new-flag-form',
		constraint: getZodConstraint(FlagSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FlagSchema })
		},
		defaultValue: {
			key: '',
			enabled: 'false',
			rolloutPercentage: '0',
			audience: '',
			description: '',
		},
	})

	return (
		<FormProvider context={form.context}>
			<Form
				method="POST"
				className="space-y-4 rounded-[14px] border bg-card p-6"
				{...getFormProps(form)}
			>
				<h3 className="text-lg font-semibold">Create New Flag</h3>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor={fields.key.id}>Key *</Label>
						<Input
							{...getInputProps(fields.key, { type: 'text' })}
							placeholder="new_feature"
						/>
						{fields.key.errors?.map((e) => (
							<p key={e} className="text-xs text-destructive">{e}</p>
						))}
					</div>
					<div className="space-y-2">
						<Label htmlFor={fields.rolloutPercentage.id}>Rollout %</Label>
						<Input
							{...getInputProps(fields.rolloutPercentage, { type: 'number' })}
							min={0}
							max={100}
						/>
					</div>
				</div>
				<div className="space-y-2">
					<Label htmlFor={fields.description.id}>Description</Label>
					<Textarea
						{...getInputProps(fields.description, { type: 'text' })}
						placeholder="What does this flag control?"
						rows={2}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={fields.audience.id}>Audience (JSON)</Label>
					<Textarea
						{...getInputProps(fields.audience, { type: 'text' })}
						placeholder='{"userIds":["..."],"countries":["FR"]}'
						rows={3}
					/>
				</div>
				<div className="flex items-center justify-end gap-3">
					<Button
						type="submit"
						name="intent"
						value="create"
						disabled={isPending}
					>
						{isPending ? 'Creating...' : 'Create Flag'}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

function FlagRow({
	flag,
}: {
	flag: Route.ComponentProps['loaderData']['flags'][number]
}) {
	const fetcher = useFetcher()

	return (
		<TableRow className="transition-colors duration-150 hover:bg-muted/50">
			<TableCell>
				<div className="flex items-center gap-2">
					<Link
						to={`/admin/flags/${flag.key}/edit`}
						className="font-mono text-sm font-medium text-primary hover:underline"
					>
						{flag.key}
					</Link>
					{flag.enabled ? (
						<Badge variant="default" className="text-xs">Enabled</Badge>
					) : (
						<Badge variant="outline" className="text-xs">Disabled</Badge>
					)}
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground hidden md:table-cell">
				{flag.rolloutPercentage != null && flag.rolloutPercentage > 0
					? `${flag.rolloutPercentage}%`
					: '—'}
			</TableCell>
			<TableCell className="text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">
				{flag.description || '—'}
			</TableCell>
			<TableCell className="text-muted-foreground hidden lg:table-cell text-xs">
				{new Date(flag.updatedAt).toLocaleDateString()}
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end gap-1">
					<fetcher.Form method="POST">
						<input type="hidden" name="key" value={flag.key} />
						<Button
							type="submit"
							name="intent"
							value="toggle"
							variant="ghost"
							size="sm"
						>
							<Icon
								name={flag.enabled ? 'cross-1' : 'check'}
								className="h-4 w-4"
							/>
						</Button>
					</fetcher.Form>
					<Button asChild variant="ghost" size="sm">
						<Link to={`/admin/flags/${flag.key}/edit`}>
							<Icon name="pencil-1" className="h-4 w-4" />
						</Link>
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive hover:text-destructive"
							>
								<Icon name="trash" className="h-4 w-4" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Flag</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete "{flag.key}"? This cannot be
									undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<fetcher.Form method="POST">
									<input type="hidden" name="key" value={flag.key} />
									<AlertDialogAction
										type="submit"
										name="intent"
										value="delete"
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										Delete
									</AlertDialogAction>
								</fetcher.Form>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</TableCell>
		</TableRow>
	)
}

export default function FlagsIndex({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { flags } = loaderData

	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Feature Flags
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage feature flags, rollouts, and audience targeting (
						{flags.length} flags)
					</p>
				</div>
			</div>

			<NewFlagForm actionData={actionData} />

			{flags.length === 0 ? (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="flag" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">No feature flags yet</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						Create your first feature flag to control features, rollouts, and
						audience targeting.
					</p>
				</div>
			) : (
				<Card className="rounded-[14px]">
					<Table>
						<TableHeader>
							<TableRow className="border-b">
								<TableHead className="font-semibold">Flag</TableHead>
								<TableHead className="font-semibold hidden md:table-cell">
									Rollout
								</TableHead>
								<TableHead className="font-semibold hidden lg:table-cell">
									Description
								</TableHead>
								<TableHead className="font-semibold hidden lg:table-cell">
									Updated
								</TableHead>
								<TableHead className="text-right font-semibold">
									Actions
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{flags.map((flag) => (
								<FlagRow key={flag.key} flag={flag} />
							))}
						</TableBody>
					</Table>
				</Card>
			)}
		</div>
	)
}
