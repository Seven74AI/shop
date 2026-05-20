import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link, data } from 'react-router'
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
import { withAudit } from '#app/utils/audit.server.ts'
import { type Route } from './+types/$promotionId_.edit.ts'

const PromotionEditSchema = z.object({
	id: z.string(),
	code: z
		.string()
		.min(1, 'Code is required')
		.max(50, 'Code must be less than 50 characters')
		.regex(/^[A-Z0-9_-]+$/, 'Code can only contain uppercase letters, numbers, hyphens, and underscores'),
	description: z
		.string()
		.max(500, 'Description must be less than 500 characters')
		.optional(),
	type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
		required_error: 'Type is required',
	}),
	value: z
		.number({ required_error: 'Value is required' })
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

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const promotion = await prisma.promotion.findUnique({
		where: { id: params.promotionId },
	})

	invariantResponse(promotion, 'Promotion not found', { status: 404 })

	return { promotion }
}

export async function action({ params, request }: Route.ActionArgs) {
	const userId = await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: PromotionEditSchema.superRefine(async (data, ctx) => {
			const existing = await prisma.promotion.findFirst({
				where: {
					code: data.code,
					id: { not: data.id },
				},
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
		return data({ result: submission.reply() }, { status: submission.status === 'error' ? 400 : 200 })
	}

	const { id, code, description, type, value, minOrderAmount, maxUses, maxUsesPerUser, isActive, startsAt, expiresAt } =
		submission.value

	const updated = await withAudit(
		{
			action: 'promotion.updated',
			entityType: 'Promotion',
			entityId: id,
			actorUserId: userId,
			getBefore: () => prisma.promotion.findUnique({ where: { id } }),
			getAfter: () => prisma.promotion.findUnique({ where: { id } }),
		},
		async () => {
			return prisma.promotion.update({
				where: { id },
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
		},
	)

	return redirectWithToast('/admin/promotions', {
		description: `Promotion "${code}" updated successfully`,
	})
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `Edit ${loaderData?.promotion.code} | Admin | Epic Shop` },
	{ name: 'description', content: `Edit promotion: ${loaderData?.promotion.code}` },
]

function formatDateForInput(date: Date | null): string {
	if (!date) return ''
	const d = new Date(date)
	// Format as YYYY-MM-DDTHH:mm (datetime-local format)
	const year = d.getFullYear()
	const month = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	const hours = String(d.getHours()).padStart(2, '0')
	const minutes = String(d.getMinutes()).padStart(2, '0')
	return `${year}-${month}-${day}T${hours}:${minutes}`
}

export default function EditPromotion({ loaderData, actionData }: Route.ComponentProps) {
	const { promotion } = loaderData
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'promotion-edit-form',
		constraint: getZodConstraint(PromotionEditSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PromotionEditSchema })
		},
		defaultValue: {
			id: promotion.id,
			code: promotion.code,
			description: promotion.description || '',
			type: promotion.type,
			value: promotion.value,
			minOrderAmount: promotion.minOrderAmount ?? undefined,
			maxUses: promotion.maxUses ?? undefined,
			maxUsesPerUser: promotion.maxUsesPerUser ?? undefined,
			isActive: promotion.isActive,
			startsAt: formatDateForInput(promotion.startsAt),
			expiresAt: formatDateForInput(promotion.expiresAt),
		},
		shouldRevalidate: 'onBlur',
	})

	const typeValue = fields.type.value as string | undefined

	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Edit Promotion
					</h1>
					<p className="text-muted-foreground text-sm">
						Update promotion: <span className="font-mono">{promotion.code}</span>
					</p>
				</div>
				<Button asChild variant="outline" className="transition-all duration-200 hover:shadow-sm">
					<Link to={`/admin/promotions/${promotion.id}`}>Cancel</Link>
				</Button>
			</div>

			<FormProvider context={form.context}>
				<Form method="POST" className="space-y-8" {...getFormProps(form)}>
					<input type="hidden" name="id" value={promotion.id} />

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
										value={typeValue || promotion.type}
										onValueChange={(value) => {
											form.update({ name: fields.type.name, value })
										}}
									>
										<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Discount type">
											<SelectValue />
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
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									/>
									<p className="text-xs text-muted-foreground">
										{typeValue === 'PERCENTAGE' || promotion.type === 'PERCENTAGE'
											? 'In basis points: 1000 = 10.00%'
											: 'In cents: 500 = $5.00'}
									</p>
									<ErrorList errors={fields.value.errors} />
								</div>

								<div className="space-y-3">
									<Label htmlFor={fields.minOrderAmount.id} className="text-sm font-medium">
										Minimum Order Amount
									</Label>
									<Input
										{...getInputProps(fields.minOrderAmount, { type: 'number' })}
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

					<div className="flex items-center justify-end space-x-4">
						<Button type="button" variant="outline" asChild className="transition-all duration-200 hover:shadow-sm">
							<Link to={`/admin/promotions/${promotion.id}`}>Cancel</Link>
						</Button>
						<Button type="submit" disabled={isPending} className="transition-all duration-200 hover:shadow-md">
							{isPending ? 'Saving...' : 'Save Changes'}
						</Button>
					</div>
				</Form>
			</FormProvider>
		</div>
	)
}
