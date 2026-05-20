import { JsonLd } from '#app/components/json-ld.tsx'
import { makeWebPageJsonLd } from '#app/utils/json-ld.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/privacy.ts'

export async function loader({ request }: Route.LoaderArgs) {
	return { siteUrl: getDomainUrl(request) }
}

export default function PrivacyRoute({ loaderData }: Route.ComponentProps) {
	const { siteUrl } = loaderData

	return (
		<>
			<JsonLd
				data={makeWebPageJsonLd({
					name: 'Privacy Policy | Epic Shop',
					url: `${siteUrl}/privacy`,
					description: 'Our privacy policy.',
				})}
			/>
			<div>Privacy</div>
		</>
	)
}
