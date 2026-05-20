import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { withAudit } from '#app/utils/audit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$attributeId.delete.ts'

export async function action({ params: _params, request }: Route.ActionArgs) {
	const userId = await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const attributeId = formData.get('attributeId')

	invariantResponse(attributeId, 'Attribute ID is required')

	// Get the attribute with its values and variant counts
	const attribute = await prisma.attribute.findUnique({
		where: { id: attributeId as string },
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

	invariantResponse(attribute, 'Attribute not found', { status: 404 })

	// Check if attribute is used in any variants
	const hasVariants = attribute.values.some(value => value._count.variants > 0)
	if (hasVariants) {
		return redirectWithToast('/admin/attributes', {
			type: 'error',
			title: 'Cannot Delete Attribute',
			description: 'This attribute is used in product variants and cannot be deleted.',
		})
	}

	// Delete the attribute (values will be deleted due to cascade) — with audit
	await withAudit(
		{
			action: 'attribute.deleted',
			entityType: 'Attribute',
			entityId: attributeId as string,
			actorUserId: userId,
			getBefore: async () => ({
				name: attribute.name,
				valueCount: attribute.values.length,
			}),
			getAfter: async () => null, // attribute no longer exists
		},
		async () =>
			prisma.attribute.delete({
				where: { id: attributeId as string },
			}),
	)

	return redirectWithToast('/admin/attributes', {
		type: 'success',
		title: 'Attribute Deleted',
		description: `"${attribute.name}" has been deleted successfully.`,
	})
}
