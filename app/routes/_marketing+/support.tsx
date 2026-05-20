import { JsonLd } from '#app/components/json-ld.tsx'
import { makeWebPageJsonLd } from '#app/utils/json-ld.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/support.ts'

export async function loader({ request }: Route.LoaderArgs) {
	return { siteUrl: getDomainUrl(request) }
}

export default function SupportRoute({ loaderData }: Route.ComponentProps) {
	const { siteUrl } = loaderData

	return (
		<>
			<JsonLd
				data={makeWebPageJsonLd({
					name: 'Support | Epic Shop',
					url: `${siteUrl}/support`,
					description: 'Get help and support.',
					pageType: 'ContactPage',
				})}
			/>
			<div>Support</div>
		</>
	)
}
