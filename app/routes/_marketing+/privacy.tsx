import { getDomainUrl } from '#app/utils/misc.tsx'
import { getOgMetas } from '#app/utils/og-metas.ts'
import { type Route } from './+types/privacy.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const baseUrl = getDomainUrl(request)
	return { baseUrl }
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	const baseUrl = loaderData?.baseUrl
	return [
		{ title: 'Privacy Policy | Epic Shop' },
		...(baseUrl
			? getOgMetas(baseUrl, {
					title: 'Privacy Policy | Epic Shop',
					description: 'Read our privacy policy to understand how we collect, use, and protect your personal data.',
					type: 'website',
				})
			: []),
	]
}

export default function PrivacyRoute() {
	return <div>Privacy</div>
}
