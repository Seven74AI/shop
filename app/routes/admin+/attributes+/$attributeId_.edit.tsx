import { useForm, getFormProps, getInputProps } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$attributeId_.edit.ts'

const AttributeEditSchema = z.object({
	id: z.string({
		error: (issue) =>
			issue.input === undefined ? 'ID is required' : 'Not a string',
	}),
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

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const attribute = await prisma.attribute.findUnique({
		where: { id: params.attributeId },
		include: {
			values: {
				orderBy: { displayOrder: 'asc' },
				include: {
					_count: {
						select: { variants: true },
					},
				},
			},
		},
	})

	invariantResponse(attribute, 'Attribute not found', { status: 404 })

	return { attribute }
}

export async function action({ params: _params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: AttributeEditSchema.superRefine(async (data, ctx) => {
			// Check name uniqueness (excluding current attribute)
			const existingAttribute = await prisma.attribute.findFirst({
				where: {
					name: data.name,
					id: { not: data.id },
				},
			})
			if (existingAttribute) {
				ctx.addIssue({
					code: 'custom',
					message: 'Attribute name already exists',
					path: ['name'],
				})
			}

			// Parse and validate values
			const values = data.values.split(',').map(v => v.trim()).filter(Boolean)
			if (values.length === 0) {
				ctx.addIssue({
					code: 'custom',
					message: 'At least one value is required',
					path: ['values'],
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const { id, name, values } = submission.value
	const valuesArray = values.split(',').map(v => v.trim()).filter(Boolean)

	// Get current attribute to check if it has variants
	const currentAttribute = await prisma.attribute.findUnique({
		where: { id },
		include: {
			values: {
				include: {
					_count: {
						select: { variants: true },
					},
				},
			},
		},
	})

	if (!currentAttribute) {
		return {
			result: submission.reply({
				formErrors: ['Attribute not found'],
			}),
		}
	}

	// Check if any values are in use
	const hasVariants = currentAttribute.values.some(value => value._count.variants > 0)
	if (hasVariants) {
		return {
			result: submission.reply({
				formErrors: ['Cannot edit attribute that is used in product variants'],
			}),
		}
	}

	// Update attribute and its values
	await prisma.$transaction(async (tx) => {
		// Update attribute name
		await tx.attribute.update({
			where: { id },
			data: { name },
		})

		// Delete existing values
		await tx.attributeValue.deleteMany({
			where: { attributeId: id },
		})

		// Create new values
		await tx.attributeValue.createMany({
			data: valuesArray.map((value: string, index: number) => ({
				attributeId: id,
				value,
				displayOrder: index,
			})),
		})
	})

	return redirectWithToast(`/admin/attributes/${id}`, {
		type: 'success',
		title: 'Success',
		description: 'Attribute updated successfully',
	})
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `Edit ${loaderData?.attribute.name} | Attributes | Admin | Epic Shop` },
	{ name: 'description', content: `Edit attribute: ${loaderData?.attribute.name}` },
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$attributeId_.edit.lazy')
