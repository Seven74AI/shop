import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { cache } from '#app/utils/cache.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { getCompanySettings } from '#app/utils/settings.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/_index.ts'

const CompanySchema = z.object({
	companyLegalName: z.string().max(200).optional(),
	companyLegalForm: z.string().max(50).optional(),
	companyCapital: z.string().max(50).optional(),
	siret: z.string().max(20).optional(),
	rcs: z.string().max(100).optional(),
	vatNumber: z.string().max(30).optional(),
	headOfficeAddress: z.string().max(500).optional(),
	directorName: z.string().max(200).optional(),
	directorContactEmail: z.string().email().optional().or(z.literal('')),
})

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, { schema: CompanySchema })

	if (submission.status !== 'success') {
		return { result: submission.reply() }
	}

	const data = submission.value

	await prisma.settings.upsert({
		where: { id: 'settings' },
		create: {
			id: 'settings',
			currencyId: 'default-usd',
			companyLegalName: data.companyLegalName || null,
			companyLegalForm: data.companyLegalForm || null,
			companyCapital: data.companyCapital || null,
			siret: data.siret || null,
			rcs: data.rcs || null,
			vatNumber: data.vatNumber || null,
			headOfficeAddress: data.headOfficeAddress || null,
			directorName: data.directorName || null,
			directorContactEmail: data.directorContactEmail || null,
		},
		update: {
			companyLegalName: data.companyLegalName || null,
			companyLegalForm: data.companyLegalForm || null,
			companyCapital: data.companyCapital || null,
			siret: data.siret || null,
			rcs: data.rcs || null,
			vatNumber: data.vatNumber || null,
			headOfficeAddress: data.headOfficeAddress || null,
			directorName: data.directorName || null,
			directorContactEmail: data.directorContactEmail || null,
		},
	})

	// Invalidate the company settings cache
	await cache.delete('settings:company')

	return redirectWithToast('/admin/settings', {
		description: 'Company legal settings updated successfully',
	})
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	const company = await getCompanySettings()
	return { company }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Settings | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage store settings' },
]

function SettingsForm({
	company,
	actionData,
}: {
	company: Route.ComponentProps['loaderData']['company']
	actionData?: Route.ComponentProps['actionData']
}) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'settings-form',
		constraint: getZodConstraint(CompanySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CompanySchema })
		},
		defaultValue: {
			companyLegalName: company.companyLegalName ?? '',
			companyLegalForm: company.companyLegalForm ?? '',
			companyCapital: company.companyCapital ?? '',
			siret: company.siret ?? '',
			rcs: company.rcs ?? '',
			vatNumber: company.vatNumber ?? '',
			headOfficeAddress: company.headOfficeAddress ?? '',
			directorName: company.directorName ?? '',
			directorContactEmail: company.directorContactEmail ?? '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FormProvider context={form.context}>
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">Company Legal Information</h2>
						<p className="text-sm text-muted-foreground">
							Required by French law (LCEN art. 6) for the Mentions Légales page.
						</p>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.companyLegalName.id} className="text-sm font-medium">
									Company Legal Name
								</Label>
								<Input
									{...getInputProps(fields.companyLegalName, { type: 'text' })}
									placeholder="e.g. Epic Shop SAS"
								/>
								<ErrorList errors={fields.companyLegalName.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.companyLegalForm.id} className="text-sm font-medium">
									Legal Form
								</Label>
								<Input
									{...getInputProps(fields.companyLegalForm, { type: 'text' })}
									placeholder="e.g. SARL, SAS, EURL"
								/>
								<ErrorList errors={fields.companyLegalForm.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.companyCapital.id} className="text-sm font-medium">
									Share Capital
								</Label>
								<Input
									{...getInputProps(fields.companyCapital, { type: 'text' })}
									placeholder="e.g. 10 000 €"
								/>
								<ErrorList errors={fields.companyCapital.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.siret.id} className="text-sm font-medium">
									SIRET Number
								</Label>
								<Input
									{...getInputProps(fields.siret, { type: 'text' })}
									placeholder="14-digit SIRET number"
								/>
								<ErrorList errors={fields.siret.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.rcs.id} className="text-sm font-medium">
									RCS Registration
								</Label>
								<Input
									{...getInputProps(fields.rcs, { type: 'text' })}
									placeholder="e.g. RCS Paris 123 456 789"
								/>
								<ErrorList errors={fields.rcs.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.vatNumber.id} className="text-sm font-medium">
									VAT Number (TVA)
								</Label>
								<Input
									{...getInputProps(fields.vatNumber, { type: 'text' })}
									placeholder="e.g. FR12345678901"
								/>
								<ErrorList errors={fields.vatNumber.errors} />
							</div>
						</div>

						<div className="space-y-3">
							<Label htmlFor={fields.headOfficeAddress.id} className="text-sm font-medium">
								Head Office Address
							</Label>
							<Textarea
								{...getTextareaProps(fields.headOfficeAddress)}
								placeholder="Full address of the registered office"
								rows={3}
							/>
							<ErrorList errors={fields.headOfficeAddress.errors} />
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.directorName.id} className="text-sm font-medium">
									Publication Director Name
								</Label>
								<Input
									{...getInputProps(fields.directorName, { type: 'text' })}
									placeholder="Full name of the director"
								/>
								<ErrorList errors={fields.directorName.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.directorContactEmail.id} className="text-sm font-medium">
									Director Contact Email
								</Label>
								<Input
									{...getInputProps(fields.directorContactEmail, { type: 'email' })}
									placeholder="contact@example.com"
								/>
								<ErrorList errors={fields.directorContactEmail.errors} />
							</div>
						</div>
					</CardContent>
				</Card>

				<div className="flex items-center justify-end space-x-4">
					<Button variant="outline" asChild>
						<a href="/admin">Cancel</a>
					</Button>
					<Button type="submit" disabled={isPending}>
						{isPending ? 'Saving...' : 'Save Settings'}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

export default function SettingsRoute({ loaderData, actionData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">Store Settings</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Manage your store's legal information and configuration
				</p>
			</div>

			<SettingsForm company={loaderData.company} actionData={actionData} />
		</div>
	)
}
