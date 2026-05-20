import { invariantResponse } from '@epic-web/invariant'
import { prisma } from '#app/utils/db.server.ts'
import { invalidateFlagCache } from '#app/utils/flag.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$flagKey.delete.ts'

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const flag = await prisma.flag.findUnique({ where: { key: params.flagKey } })
	invariantResponse(flag, 'Feature flag not found', { status: 404 })

	await prisma.flag.delete({ where: { key: flag.key } })

	invalidateFlagCache()

	return redirectWithToast('/admin/feature-flags', {
		type: 'success',
		description: `Feature flag "${flag.key}" deleted`,
	})
}
