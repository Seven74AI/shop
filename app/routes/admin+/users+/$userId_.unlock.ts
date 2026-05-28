import { invariantResponse } from '@epic-web/invariant'
import { prisma } from '#app/utils/db.server.ts'
import { resetAttempts } from '#app/utils/lockout.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$userId_.unlock.ts'

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const user = await prisma.user.findUnique({
		where: { id: params.userId },
		select: { id: true, username: true },
	})

	invariantResponse(user, 'User not found', { status: 404 })

	await resetAttempts(user.id)

	return redirectWithToast(`/admin/users/${user.id}`, {
		title: 'Account Unlocked',
		description: `Lockout reset for ${user.username}.`,
	})
}
