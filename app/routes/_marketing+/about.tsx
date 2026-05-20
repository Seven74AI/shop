import { JsonLd } from '#app/components/json-ld.tsx'
import { makeWebPageJsonLd } from '#app/utils/json-ld.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/about.ts'

export async function loader({ request }: Route.LoaderArgs) {
	return { siteUrl: getDomainUrl(request) }
}

export default function AboutRoute({ loaderData }: Route.ComponentProps) {
	const { siteUrl } = loaderData

	return (
		<>
			<JsonLd
				data={makeWebPageJsonLd({
					name: 'About | Epic Shop',
					url: `${siteUrl}/about`,
					description: 'Learn more about our shop.',
					pageType: 'AboutPage',
				})}
			/>
			<div>About page</div>
		</>
	)
}
