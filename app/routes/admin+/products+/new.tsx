import { getFormProps, getInputProps, getTextareaProps, useForm, type FieldMetadata } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { useRef, useCallback } from 'react'
import { Form, Link } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import ProductTag from '#app/components/ui/productTag.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#app/components/ui/select.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { PRODUCT_STATUSES } from '#app/schemas/constants'
import { productSchema, type ImageFieldset } from '#app/schemas/product.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/new.ts'
import { ImageChooser, VariantRow } from './__product-form-components.tsx'

export { action } from './__new.server.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const [categories, attributes] = await Promise.all([
		prisma.category.findMany({
			select: { id: true, name: true, parentId: true },
			orderBy: { name: 'asc' },
		}),
		prisma.attribute.findMany({
			include: {
				values: {
					orderBy: { displayOrder: 'asc' },
				},
			},
			orderBy: { displayOrder: 'asc' },
		}),
	])

	return {
		categories,
		attributes: attributes.map(attr => ({
			id: attr.id,
			name: attr.name,
			values: attr.values.map(value => ({
				id: value.id,
				value: value.value,
			})),
		})),
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'New Product | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new product' },
]

const productWithoutIdSchema = productSchema.omit({ id: true })

// Lazy-load admin route component for code splitting
export const lazy = () => import('./new.lazy')
