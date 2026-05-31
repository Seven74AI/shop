import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	
	// Get statistics for the dashboard
	const [productCount, categoryCount, attributeCount] = await Promise.all([
		prisma.product.count(),
		prisma.category.count(),
		prisma.attribute.count(),
	])
	
	return {
		stats: {
			products: productCount,
			categories: categoryCount,
			attributes: attributeCount,
		},
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Admin Dashboard | Epic Shop' },
	{ name: 'description', content: 'Admin dashboard for managing products and categories' },
]

// Lazy-load admin route component for code splitting
export const lazy = () => import('./index.lazy')
