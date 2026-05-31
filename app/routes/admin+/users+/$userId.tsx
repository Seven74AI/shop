import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$userId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { userId } = params

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			image: {
				select: {
					objectKey: true,
					altText: true,
				},
			},
			roles: {
				select: {
					id: true,
					name: true,
					description: true,
				},
			},
			orders: {
				select: {
					id: true,
					orderNumber: true,
					status: true,
					total: true,
					createdAt: true,
				},
				orderBy: { createdAt: 'desc' },
				take: 10, // Show last 10 orders
			},
			sessions: {
				select: {
					id: true,
					expirationDate: true,
					createdAt: true,
				},
				orderBy: { createdAt: 'desc' },
				take: 10, // Show last 10 sessions
			},
			_count: {
				select: {
					orders: true,
					sessions: true,
					notes: true,
				},
			},
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	return {
		user,
	}
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.user) {
		return [{ title: 'User Not Found | Admin | Epic Shop' }]
	}
	return [
		{
			title: `${loaderData.user.name || loaderData.user.username} | Admin | Epic Shop`,
		},
		{
			name: 'description',
			content: `View user details: ${loaderData.user.email}`,
		},
	]
}

// Lazy-load admin route component for code splitting
export const lazy = () => import('./$userId.lazy')
