import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$rateId.delete.ts'

export async function action({ params: _params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const rateId = formData.get('rateId')

	invariantResponse(rateId, 'Rate ID is required')

	const taxRate = await prisma.taxRate.findUnique({
		where: { id: rateId as string },
	})

	invariantResponse(taxRate, 'Tax rate not found', { status: 404 })

	await prisma.taxRate.delete({
		where: { id: rateId as string },
	})

	return redirectWithToast('/admin/tax-rates', {
		type: 'success',
		description: `${taxRate.kind} tax rate for ${taxRate.country} deleted`,
	})
}
