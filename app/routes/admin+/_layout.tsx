import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/_layout.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	return {}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Admin | Epic Shop' },
	{ name: 'description', content: 'Admin dashboard for managing your e-commerce store' },
]

// Lazy-load admin layout component for code splitting
export const lazy = () => import('./_layout.lazy')
