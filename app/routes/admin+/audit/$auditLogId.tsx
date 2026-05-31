import { Link, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	const entry = await prisma.auditLog.findUnique({
		where: { id: params.auditLogId },
		include: {
			user: {
				select: { id: true, email: true, username: true, name: true },
			},
		},
	})

	if (!entry) {
		throw new Response('Audit log entry not found', { status: 404 })
	}

	return { entry }
}

export const meta: MetaFunction = ({ data }) => [
	{
		title: `Audit Entry | Admin | Epic Shop`,
	},
	{
		name: 'description',
		content: `Detailed view of audit log entry`,
	},
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$auditLogId.lazy')
