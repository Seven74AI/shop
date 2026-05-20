import { useForm, getFormProps, getInputProps, FormProvider, useInputControl } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
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
import { type Route } from './+types/new.ts'

const TaxRateSchema = z.object({
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
})

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: TaxRateSchema.superRefine(async (data, ctx) => {
			// Check uniqueness of [country, kind, effectiveFrom]
			const effectiveFromDate = new Date(data.effectiveFrom)
			const existingRate = await prisma.taxRate.findFirst({
				where: {
					country: data.country,
					kind: data.kind,
					effectiveFrom: effectiveFromDate,
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

	const { country, kind, rate, effectiveFrom, effectiveTo } = submission.value

	await prisma.taxRate.create({
		data: {
			country,
			kind,
			rate,
			effectiveFrom: new Date(effectiveFrom),
			effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
			isActive: true,
		},
	})

	return redirectWithToast('/admin/tax-rates', {
		description: `Tax rate created: ${kind} ${rate / 100}% for ${country}`,
	})
}

export const meta: Route.MetaFunction = () => [
	{ title: 'New Tax Rate | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new tax rate' },
]

function CountrySelect({
	field,
}: {
	field: ReturnType<typeof useForm<z.infer<typeof TaxRateSchema>>>[1]['country']
}) {
	const input = useInputControl(field)

	// EU country codes most relevant for VAT
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

function TaxRateForm({ actionData }: { actionData?: Route.ComponentProps['actionData'] }) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'tax-rate-form',
		constraint: getZodConstraint(TaxRateSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: TaxRateSchema })
		},
		defaultValue: {
			country: '',
			kind: 'STANDARD',
			rate: 2000,
			effectiveFrom: new Date().toISOString().split('T')[0],
			effectiveTo: '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FormProvider context={form.context}>
			<Form
				method="POST"
				className="space-y-8"
				{...getFormProps(form)}
			>
				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">Tax Rate Information</h2>
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
					</CardContent>
				</Card>

				{/* Actions */}
				<div className="flex items-center justify-end space-x-4">
					<Button variant="outline" asChild className="transition-all duration-200 hover:shadow-sm">
						<Link to="/admin/tax-rates">
							Cancel
						</Link>
					</Button>
					<Button type="submit" disabled={isPending} className="transition-all duration-200 hover:shadow-md">
						{isPending ? 'Creating...' : 'Create Tax Rate'}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

function TaxKindSelect({
	field,
}: {
	field: ReturnType<typeof useForm<z.infer<typeof TaxRateSchema>>>[1]['kind']
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

export default function NewTaxRate({ actionData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">Create New Tax Rate</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Add a new tax rate for VAT calculations
				</p>
			</div>

			<TaxRateForm actionData={actionData} />
		</div>
	)
}
