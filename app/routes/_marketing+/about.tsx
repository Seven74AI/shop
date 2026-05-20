import { getDomainUrl } from '#app/utils/misc.tsx'
import { getOgMetas } from '#app/utils/og-metas.ts'
import { type Route } from './+types/about.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const baseUrl = getDomainUrl(request)
	return { baseUrl }
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	const baseUrl = loaderData?.baseUrl
	return [
		{ title: 'About | Epic Shop' },
		...(baseUrl
			? getOgMetas(baseUrl, {
					title: 'About | Epic Shop',
					description: 'Learn more about Epic Shop, the best place to find amazing products.',
					type: 'website',
				})
			: []),
	]
}

export default function AboutRoute() {
	return <div>About page</div>
}
