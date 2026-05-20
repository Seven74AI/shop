/**
 * Default OG image to use when no specific image is available.
 * Falls back to the site favicon (always present).
 */
const DEFAULT_OG_IMAGE = '/favicon.ico'

interface OgMetasInput {
	/** Page title (used for og:title + twitter:title) */
	title: string
	/** Page description (used for og:description + twitter:description) */
	description: string
	/**
	 * OG type: 'website', 'product', 'article', etc.
	 * @default 'website'
	 */
	type?: string
	/**
	 * Image URL. If relative, will be resolved to absolute using the request origin.
	 * If omitted, a default site image is used.
	 */
	image?: string
	/**
	 * Canonical URL. If relative, will be resolved to absolute using the request origin.
	 * If omitted, og:url is not emitted.
	 */
	url?: string
}

/**
 * Build OpenGraph + Twitter Card meta tags for a route's MetaFunction.
 *
 * Usage in a route loader + meta:
 * ```ts
 * export async function loader({ request, params }: Route.LoaderArgs) {
 *   const product = await getProduct(params.slug)
 *   return { product, baseUrl: getDomainUrl(request) }
 * }
 *
 * export const meta: Route.MetaFunction = ({ loaderData, location }) => {
 *   const product = loaderData?.product
 *   if (!product) return [{ title: 'Not Found' }]
 *   const imageUrl = product.images?.[0]
 *     ? `/resources/images?objectKey=${product.images[0].objectKey}`
 *     : undefined
 *   return getOgMetas(loaderData.baseUrl, {
 *     title: product.name,
 *     description: product.description ?? 'View this product',
 *     type: 'product',
 *     image: imageUrl,
 *     url: location.pathname,
 *   })
 * }
 * ```
 */
export function getOgMetas(
	baseUrl: string,
	input: OgMetasInput,
): Array<Record<string, string>> {
	const { title, description, type = 'website', image, url } = input

	const resolveUrl = (path?: string) => {
		if (!path) return undefined
		if (path.startsWith('http')) return path
		return `${baseUrl}${path}`
	}

	const ogImage = resolveUrl(image) ?? `${baseUrl}${DEFAULT_OG_IMAGE}`
	const ogUrl = resolveUrl(url)

	const tags: Array<Record<string, string>> = [
		// OpenGraph
		{ property: 'og:title', content: title },
		{ property: 'og:description', content: description },
		{ property: 'og:type', content: type },
		{ property: 'og:image', content: ogImage },
		// Twitter Card
		{ name: 'twitter:card', content: 'summary_large_image' },
		{ name: 'twitter:title', content: title },
		{ name: 'twitter:description', content: description },
		{ name: 'twitter:image', content: ogImage },
	]

	if (ogUrl) {
		tags.push({ property: 'og:url', content: ogUrl })
	}

	return tags
}
