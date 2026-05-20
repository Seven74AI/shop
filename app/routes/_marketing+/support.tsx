import { getDomainUrl } from '#app/utils/misc.tsx'
import { getOgMetas } from '#app/utils/og-metas.ts'
import { type Route } from './+types/support.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const baseUrl = getDomainUrl(request)
	return { baseUrl }
}

export const meta: Route.MetaFunction = ({ loaderData, location }) => {
	const baseUrl = loaderData?.baseUrl
	return [
		{ title: 'Support | Epic Shop' },
		{ name: 'description', content: 'Need help? Contact Epic Shop support for assistance with your orders and more.' },
		...(baseUrl
			? getOgMetas(baseUrl, {
					title: 'Support | Epic Shop',
					description: 'Need help? Contact Epic Shop support for assistance with your orders and more.',
					type: 'website',
					url: location.pathname,
				})
			: []),
	]
}

export default function SupportRoute() {
	return <div>Support</div>
}
