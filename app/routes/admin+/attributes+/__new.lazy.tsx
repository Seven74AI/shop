import { useForm, getFormProps, getInputProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint  } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { useIsPending } from '#app/utils/misc.tsx'
import { type Route } from './+types/new.ts'

const VariantAttributeSchema = z.object({
	name: z.string({
		error: (issue) =>
			issue.input === undefined ? 'Name is required' : 'Not a string',
	}).min(1, { error: 'Name is required' }).max(50, {
		error: 'Name must be less than 50 characters',
	}),
	values: z.string({
		error: (issue) =>
			issue.input === undefined ? 'At least one value is required' : 'Not a string',
	}).min(1, { error: 'At least one value is required' }),
})



function AttributeForm({ actionData }: { actionData?: Route.ComponentProps['actionData'] }) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'attribute-form',
		constraint: getZodConstraint(VariantAttributeSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: VariantAttributeSchema })
		},
		defaultValue: {
			name: '',
			values: '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FormProvider context={form.context}>
			<Form
				method="POST"
				{...getFormProps(form)}
			>
				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">Attribute Information</h2>
					</CardHeader>
					<CardContent>
						<div className="grid gap-6">
							<div className="space-y-2">
								<Label htmlFor={fields.name.id}>Attribute Name</Label>
								<Input
									{...getInputProps(fields.name, { type: 'text' })}
									placeholder="e.g., Size, Color, Material"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<ErrorList errors={fields.name.errors} />
							</div>

							<div className="space-y-2">
								<Label htmlFor={fields.values.id}>Values</Label>
								<Textarea
									{...getInputProps(fields.values, { type: 'text' })}
									placeholder="e.g., Small, Medium, Large (comma-separated)"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									rows={3}
								/>
								<p className="text-xs text-muted-foreground">
									Enter values separated by commas. For example: "XS, S, M, L, XL" or "Red, Blue, Green"
								</p>
								<ErrorList errors={fields.values.errors} />
							</div>
						</div>

						{/* Action buttons */}
						<div className="flex gap-4 justify-end mt-8 pt-6 border-t">
							<Button variant="outline" asChild>
								<Link to="/admin/attributes">
									Cancel
								</Link>
							</Button>
							<Button 
								type="submit" 
								disabled={isPending}
								className="transition-all duration-200"
							>
								{isPending ? (
									<>
										<Icon name="update" className="h-4 w-4 mr-2 animate-spin" />
										Creating...
									</>
								) : (
									<>
										<Icon name="check" className="h-4 w-4 mr-2" />
										Create Attribute
									</>
								)}
							</Button>
						</div>
					</CardContent>
				</Card>
			</Form>
		</FormProvider>
	)
}

export default function NewVariantAttribute({ actionData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Create New Attribute</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Add a new attribute for product variants (e.g., Size, Color, Material)
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/admin/attributes">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Attributes
					</Link>
				</Button>
			</div>

			<AttributeForm actionData={actionData} />
		</div>
	)
}
