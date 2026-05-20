import { JsonLd } from '#app/components/json-ld.tsx'
import { makeWebPageJsonLd } from '#app/utils/json-ld.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/tos.ts'

export async function loader({ request }: Route.LoaderArgs) {
	return { siteUrl: getDomainUrl(request) }
}

export default function TermsOfServiceRoute({ loaderData }: Route.ComponentProps) {
	const { siteUrl } = loaderData

	return (
		<>
			<JsonLd
				data={makeWebPageJsonLd({
					name: 'Terms of Service | Epic Shop',
					url: `${siteUrl}/tos`,
					description: 'Our terms of service and conditions.',
				})}
			/>
			<div>Terms of service</div>
		</>
	)
}
