import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { auditLog } from '#app/utils/audit.server.ts'
import { type Route } from './+types/new.ts'

const PromotionSchema = z.object({
	code: z
		.string({
			required_error: 'Code is required',
			invalid_type_error: 'Code must be a string',
		})
		.min(1, 'Code is required')
		.max(50, 'Code must be less than 50 characters')
		.regex(/^[A-Z0-9_-]+$/, 'Code can only contain uppercase letters, numbers, hyphens, and underscores'),
	description: z
		.string()
		.max(500, 'Description must be less than 500 characters')
		.optional(),
	type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
		required_error: 'Type is required',
		invalid_type_error: 'Type must be PERCENTAGE or FIXED_AMOUNT',
	}),
	value: z
		.number({
			required_error: 'Value is required',
			invalid_type_error: 'Value must be a number',
		})
		.int('Value must be a whole number')
		.positive('Value must be positive'),
	minOrderAmount: z
		.number({ invalid_type_error: 'Minimum order amount must be a number' })
		.int()
		.min(0)
		.optional()
		.nullable(),
	maxUses: z
		.number({ invalid_type_error: 'Max uses must be a number' })
		.int()
		.positive('Max uses must be positive')
		.optional()
		.nullable(),
	maxUsesPerUser: z
		.number({ invalid_type_error: 'Max uses per user must be a number' })
		.int()
		.positive('Max uses per user must be positive')
		.optional()
		.nullable(),
	isActive: z.boolean().default(true),
	startsAt: z.string().optional().nullable(),
	expiresAt: z.string().optional().nullable(),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: PromotionSchema.superRefine(async (data, ctx) => {
			const existing = await prisma.promotion.findUnique({
				where: { code: data.code },
			})
			if (existing) {
				ctx.addIssue({
					code: 'custom',
					message: 'A promotion with this code already exists',
					path: ['code'],
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return { result: submission.reply() }
	}

	const { code, description, type, value, minOrderAmount, maxUses, maxUsesPerUser, isActive, startsAt, expiresAt } =
		submission.value

	const promotion = await prisma.promotion.create({
		data: {
			code,
			description: description || null,
			type,
			value,
			minOrderAmount: minOrderAmount ?? null,
			maxUses: maxUses ?? null,
			maxUsesPerUser: maxUsesPerUser ?? null,
			isActive,
			startsAt: startsAt ? new Date(startsAt) : null,
			expiresAt: expiresAt ? new Date(expiresAt) : null,
		},
	})

	await auditLog({
		action: 'promotion.created',
		entityType: 'Promotion',
		entityId: promotion.id,
		actorUserId: userId,
		after: promotion,
	})

	return redirectWithToast(`/admin/promotions/${promotion.id}`, {
		description: `Promotion "${code}" created successfully`,
	})
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	return {}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'New Promotion | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new promotion or coupon code' },
]

function PromotionForm({
	actionData,
}: {
	actionData?: Route.ComponentProps['actionData']
}) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'promotion-form',
		constraint: getZodConstraint(PromotionSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PromotionSchema })
		},
		defaultValue: {
			code: '',
			description: '',
			type: 'PERCENTAGE',
			value: undefined,
			minOrderAmount: undefined,
			maxUses: undefined,
			maxUsesPerUser: undefined,
			isActive: true,
			startsAt: '',
			expiresAt: '',
		},
		shouldRevalidate: 'onBlur',
	})

	const typeValue = fields.type.value as string | undefined

	return (
		<FormProvider context={form.context}>
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">Promotion Information</h2>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.code.id} className="text-sm font-medium">
									Coupon Code *
								</Label>
								<Input
									{...getInputProps(fields.code, { type: 'text' })}
									placeholder="e.g. SUMMER2026"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 font-mono uppercase"
								/>
								<ErrorList errors={fields.code.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.type.id} className="text-sm font-medium">
									Discount Type *
								</Label>
								<Select
									name={fields.type.name}
									value={typeValue || 'PERCENTAGE'}
									onValueChange={(value) => {
										form.update({ name: fields.type.name, value })
									}}
								>
									<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Discount type">
										<SelectValue placeholder="Select type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="PERCENTAGE">Percentage Discount</SelectItem>
										<SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
									</SelectContent>
								</Select>
								<ErrorList errors={fields.type.errors} />
							</div>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.value.id} className="text-sm font-medium">
									Discount Value *
								</Label>
								<Input
									{...getInputProps(fields.value, { type: 'number' })}
									placeholder={typeValue === 'PERCENTAGE' ? 'e.g. 1000 (10.00%)' : 'e.g. 500 ($5.00)'}
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									{typeValue === 'PERCENTAGE'
										? 'In basis points: 1000 = 10.00%, 500 = 5.00%'
										: 'In cents: 500 = $5.00, 1000 = $10.00'}
								</p>
								<ErrorList errors={fields.value.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.minOrderAmount.id} className="text-sm font-medium">
									Minimum Order Amount
								</Label>
								<Input
									{...getInputProps(fields.minOrderAmount, { type: 'number' })}
									placeholder="e.g. 5000 ($50.00) or leave empty"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">In cents. Leave empty for no minimum.</p>
								<ErrorList errors={fields.minOrderAmount.errors} />
							</div>
						</div>

						<div className="space-y-3">
							<Label htmlFor={fields.description.id} className="text-sm font-medium">
								Description
							</Label>
							<Textarea
								{...getTextareaProps(fields.description)}
								placeholder="e.g. Summer 2026 sale — 10% off all orders over $50"
								rows={3}
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							/>
							<ErrorList errors={fields.description.errors} />
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">Usage Limits</h2>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.maxUses.id} className="text-sm font-medium">
									Maximum Total Uses
								</Label>
								<Input
									{...getInputProps(fields.maxUses, { type: 'number' })}
									placeholder="Leave empty for unlimited"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<ErrorList errors={fields.maxUses.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.maxUsesPerUser.id} className="text-sm font-medium">
									Maximum Uses Per User
								</Label>
								<Input
									{...getInputProps(fields.maxUsesPerUser, { type: 'number' })}
									placeholder="Leave empty for unlimited"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<ErrorList errors={fields.maxUsesPerUser.errors} />
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">Schedule & Status</h2>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.startsAt.id} className="text-sm font-medium">
									Start Date
								</Label>
								<Input
									{...getInputProps(fields.startsAt, { type: 'datetime-local' })}
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">Leave empty to start immediately.</p>
								<ErrorList errors={fields.startsAt.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.expiresAt.id} className="text-sm font-medium">
									Expiry Date
								</Label>
								<Input
									{...getInputProps(fields.expiresAt, { type: 'datetime-local' })}
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">Leave empty for no expiry.</p>
								<ErrorList errors={fields.expiresAt.errors} />
							</div>
						</div>

						<div className="flex items-center space-x-3">
							<Checkbox
								id={fields.isActive.id}
								name={fields.isActive.name}
								defaultChecked={fields.isActive.value as boolean}
								onCheckedChange={(checked) => {
									form.update({
										name: fields.isActive.name,
										value: checked === true,
									})
								}}
							/>
							<Label htmlFor={fields.isActive.id} className="text-sm font-medium">
								Active
							</Label>
						</div>
						<ErrorList errors={fields.isActive.errors} />
					</CardContent>
				</Card>

				{/* Actions */}
				<div className="flex items-center justify-end space-x-4">
					<Button variant="outline" asChild className="transition-all duration-200 hover:shadow-sm">
						<a href="/admin/promotions">Cancel</a>
					</Button>
					<Button type="submit" disabled={isPending} className="transition-all duration-200 hover:shadow-md">
						{isPending ? 'Creating...' : 'Create Promotion'}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

export default function NewPromotion({ actionData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">Create New Promotion</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Add a new promotion or coupon code for your customers
				</p>
			</div>

			<PromotionForm actionData={actionData} />
		</div>
	)
}
