import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	return {}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Feature Flags | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage feature flags' },
]

export default function FeatureFlagsRedirect() {
	return null
}
