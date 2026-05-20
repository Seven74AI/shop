import { getDomainUrl } from '#app/utils/misc.tsx'
import { getOgMetas } from '#app/utils/og-metas.ts'
import { type Route } from './+types/tos.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const baseUrl = getDomainUrl(request)
	return { baseUrl }
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	const baseUrl = loaderData?.baseUrl
	return [
		{ title: 'Terms of Service | Epic Shop' },
		...(baseUrl
			? getOgMetas(baseUrl, {
					title: 'Terms of Service | Epic Shop',
					description: 'Review our terms of service to understand the rules and guidelines for using Epic Shop.',
					type: 'website',
				})
			: []),
	]
}

export default function TermsOfServiceRoute() {
	return <div>Terms of service</div>
}
