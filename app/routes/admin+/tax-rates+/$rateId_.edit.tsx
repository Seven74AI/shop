import { useForm, getFormProps, getInputProps, FormProvider, useInputControl } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
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
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$rateId_.edit.ts'

const TaxRateEditSchema = z.object({
	id: z.string(),
	country: z.string({
		error: (issue) =>
			issue.input === undefined ? 'Country code is required' : 'Not a string',
	}).length(2, { error: 'Country code must be exactly 2 characters (ISO 2-letter)' }).regex(/^[A-Z]{2}$/, {
		error: 'Country code must be uppercase ISO 2-letter (e.g., FR, DE, GB)',
	}),
	kind: z.enum(['STANDARD', 'REDUCED', 'SUPER_REDUCED', 'ZERO'], {
		error: 'Tax kind is required',
	}),
	rate: z.number({
		error: (issue) =>
			issue.input === undefined ? 'Rate is required' : 'Rate must be a number',
	}).min(0, { error: 'Rate cannot be negative' }).max(10000, {
		error: 'Rate cannot exceed 100%',
	}),
	effectiveFrom: z.string({
		error: 'Effective date is required',
	}).min(1, { error: 'Effective date is required' }),
	effectiveTo: z.string().optional(),
	isActive: z.string().optional(),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const taxRate = await prisma.taxRate.findUnique({
		where: { id: params.rateId },
	})

	invariantResponse(taxRate, 'Tax rate not found', { status: 404 })

	return { taxRate }
}

export async function action({ params: _params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: TaxRateEditSchema.superRefine(async (data, ctx) => {
			// Check uniqueness of [country, kind, effectiveFrom] excluding current
			const effectiveFromDate = new Date(data.effectiveFrom)
			const existingRate = await prisma.taxRate.findFirst({
				where: {
					country: data.country,
					kind: data.kind,
					effectiveFrom: effectiveFromDate,
					id: { not: data.id },
				},
			})
			if (existingRate) {
				ctx.addIssue({
					code: 'custom',
					message: `A ${data.kind} tax rate for ${data.country} with this effective date already exists`,
					path: ['country'],
				})
			}

			// Validate effectiveTo is after effectiveFrom if provided
			if (data.effectiveTo) {
				const toDate = new Date(data.effectiveTo)
				if (toDate <= effectiveFromDate) {
					ctx.addIssue({
						code: 'custom',
						message: 'Effective end date must be after effective start date',
						path: ['effectiveTo'],
					})
				}
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const { id, country, kind, rate, effectiveFrom, effectiveTo, isActive } = submission.value

	await prisma.taxRate.update({
		where: { id },
		data: {
			country,
			kind,
			rate,
			effectiveFrom: new Date(effectiveFrom),
			effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
			isActive: isActive === 'true',
		},
	})

	return redirectWithToast(`/admin/tax-rates/${id}`, {
		type: 'success',
		description: 'Tax rate updated successfully',
	})
}

export const meta: Route.MetaFunction = ({ loaderData }: { loaderData: Route.ComponentProps['loaderData'] | undefined }) => [
	{ title: `Edit ${loaderData?.taxRate.kind} ${loaderData?.taxRate.country} | Tax Rates | Admin | Epic Shop` },
	{ name: 'description', content: `Edit tax rate for ${loaderData?.taxRate.country}` },
]

function CountrySelect({
	field,
}: {
	field: ReturnType<typeof useForm<z.infer<typeof TaxRateEditSchema>>>[1]['country']
}) {
	const input = useInputControl(field)

	const countries = [
		{ code: 'FR', name: 'France' },
		{ code: 'DE', name: 'Germany' },
		{ code: 'GB', name: 'United Kingdom' },
		{ code: 'IT', name: 'Italy' },
		{ code: 'ES', name: 'Spain' },
		{ code: 'NL', name: 'Netherlands' },
		{ code: 'BE', name: 'Belgium' },
		{ code: 'PT', name: 'Portugal' },
		{ code: 'AT', name: 'Austria' },
		{ code: 'PL', name: 'Poland' },
		{ code: 'SE', name: 'Sweden' },
		{ code: 'CZ', name: 'Czech Republic' },
		{ code: 'DK', name: 'Denmark' },
		{ code: 'FI', name: 'Finland' },
		{ code: 'IE', name: 'Ireland' },
		{ code: 'GR', name: 'Greece' },
		{ code: 'HU', name: 'Hungary' },
		{ code: 'RO', name: 'Romania' },
		{ code: 'BG', name: 'Bulgaria' },
		{ code: 'SK', name: 'Slovakia' },
		{ code: 'HR', name: 'Croatia' },
		{ code: 'LT', name: 'Lithuania' },
		{ code: 'LV', name: 'Latvia' },
		{ code: 'EE', name: 'Estonia' },
		{ code: 'SI', name: 'Slovenia' },
		{ code: 'CY', name: 'Cyprus' },
		{ code: 'MT', name: 'Malta' },
		{ code: 'LU', name: 'Luxembourg' },
		{ code: 'US', name: 'United States' },
		{ code: 'CA', name: 'Canada' },
		{ code: 'AU', name: 'Australia' },
		{ code: 'JP', name: 'Japan' },
		{ code: 'CH', name: 'Switzerland' },
		{ code: 'NO', name: 'Norway' },
	]

	return (
		<Select
			value={typeof input.value === 'string' && input.value ? input.value : ''}
			onValueChange={(value: string) => {
				input.change(value)
			}}
		>
			<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Country">
				<SelectValue placeholder="Select country" />
			</SelectTrigger>
			<SelectContent>
				{countries.map((c) => (
					<SelectItem key={c.code} value={c.code}>
						{c.name} ({c.code})
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

function TaxKindSelect({
	field,
}: {
	field: ReturnType<typeof useForm<z.infer<typeof TaxRateEditSchema>>>[1]['kind']
}) {
	const input = useInputControl(field)

	return (
		<Select
			value={typeof input.value === 'string' && input.value ? input.value : 'STANDARD'}
			onValueChange={(value: string) => {
				input.change(value)
			}}
		>
			<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Tax kind">
				<SelectValue placeholder="Select tax kind" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="STANDARD">STANDARD - Normal rate</SelectItem>
				<SelectItem value="REDUCED">REDUCED - Lower rate</SelectItem>
				<SelectItem value="SUPER_REDUCED">SUPER REDUCED - Very low rate</SelectItem>
				<SelectItem value="ZERO">ZERO - 0% rate</SelectItem>
			</SelectContent>
		</Select>
	)
}

export default function TaxRateEdit({ loaderData, actionData }: Route.ComponentProps) {
	const { taxRate } = loaderData
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'tax-rate-edit-form',
		constraint: getZodConstraint(TaxRateEditSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: TaxRateEditSchema })
		},
		defaultValue: {
			id: taxRate.id,
			country: taxRate.country,
			kind: taxRate.kind,
			rate: taxRate.rate,
			effectiveFrom: new Date(taxRate.effectiveFrom).toISOString().split('T')[0],
			effectiveTo: taxRate.effectiveTo
				? new Date(taxRate.effectiveTo).toISOString().split('T')[0]
				: '',
			isActive: taxRate.isActive ? 'true' : 'false',
		},
	})

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Edit Tax Rate</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Update tax rate information for {taxRate.country}
					</p>
				</div>
				<Button variant="outline" asChild className="h-9 rounded-lg font-medium">
					<Link to={`/admin/tax-rates/${taxRate.id}`}>
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Tax Rate
					</Link>
				</Button>
			</div>

			<FormProvider context={form.context}>
				<Form
					method="POST"
					className="space-y-8"
					{...getFormProps(form)}
				>
					<input type="hidden" name="id" value={taxRate.id} />

					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Tax Rate Details</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-6 md:grid-cols-2">
								<div className="space-y-3">
									<Label htmlFor={fields.country.id} className="text-sm font-medium">Country *</Label>
									<CountrySelect field={fields.country} />
									<ErrorList errors={fields.country.errors} />
								</div>

								<div className="space-y-3">
									<Label htmlFor={fields.kind.id} className="text-sm font-medium">Tax Kind *</Label>
									<TaxKindSelect field={fields.kind} />
									<ErrorList errors={fields.kind.errors} />
								</div>
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.rate.id} className="text-sm font-medium">Rate (basis points) *</Label>
								<Input
									{...getInputProps(fields.rate, { type: 'number' })}
									placeholder="2000 = 20.00%"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									Enter rate in basis points. 2000 = 20.00%, 550 = 5.50%, 210 = 2.10%
								</p>
								<ErrorList errors={fields.rate.errors} />
							</div>

							<div className="grid gap-6 md:grid-cols-2">
								<div className="space-y-3">
									<Label htmlFor={fields.effectiveFrom.id} className="text-sm font-medium">Effective From *</Label>
									<Input
										{...getInputProps(fields.effectiveFrom, { type: 'date' })}
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									/>
									<ErrorList errors={fields.effectiveFrom.errors} />
								</div>

								<div className="space-y-3">
									<Label htmlFor={fields.effectiveTo.id} className="text-sm font-medium">Effective To</Label>
									<Input
										{...getInputProps(fields.effectiveTo, { type: 'date' })}
										placeholder="Leave empty for open-ended"
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									/>
									<p className="text-xs text-muted-foreground">
										Leave empty if the rate has no end date
									</p>
									<ErrorList errors={fields.effectiveTo.errors} />
								</div>
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.isActive.id} className="text-sm font-medium">Status</Label>
								<ActiveStatusSelect field={fields.isActive} />
								<p className="text-xs text-muted-foreground">
									Inactive rates are not used in tax calculations
								</p>
								<ErrorList errors={fields.isActive.errors} />
							</div>
						</CardContent>
					</Card>

					{/* Actions */}
					<div className="flex items-center justify-end space-x-4">
						<Button variant="outline" asChild className="transition-all duration-200 hover:shadow-sm">
							<Link to={`/admin/tax-rates/${taxRate.id}`}>
								Cancel
							</Link>
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

function ActiveStatusSelect({
	field,
}: {
	field: ReturnType<typeof useForm<z.infer<typeof TaxRateEditSchema>>>[1]['isActive']
}) {
	const input = useInputControl(field)

	return (
		<Select
			value={typeof input.value === 'string' && input.value ? input.value : 'true'}
			onValueChange={(value: string) => {
				input.change(value)
			}}
		>
			<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 w-48" aria-label="Status">
				<SelectValue placeholder="Select status" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="true">Active</SelectItem>
				<SelectItem value="false">Inactive</SelectItem>
			</SelectContent>
		</Select>
	)
}
