/**
 * JSON-LD structured data utilities for Schema.org types.
 *
 * Generates type-safe JSON-LD objects for SEO:
 * - Organization, WebSite (home page)
 * - Product with Offer (product detail)
 * - ItemList (product listings)
 * - CollectionPage (category pages)
 * - BreadcrumbList (navigation)
 * - WebPage, AboutPage, ContactPage (static pages)
 */

type Offer = {
	'@type': 'Offer'
	price: string
	priceCurrency: string
	availability: 'https://schema.org/InStock' | 'https://schema.org/OutOfStock' | 'https://schema.org/PreOrder'
	url: string
	priceValidUntil?: string
}

type AggregateOffer = {
	'@type': 'AggregateOffer'
	lowPrice: string
	highPrice: string
	priceCurrency: string
	offerCount: number
}

type Product = {
	'@type': 'Product'
	name: string
	description?: string
	sku: string
	image?: string[]
	brand?: { '@type': 'Brand'; name: string }
	category?: string
	offers: Offer | AggregateOffer
	url: string
}

/** Generic JSON-LD node */
export type JsonLdNode = Record<string, unknown> & { '@type': string }

/**
 * Renders a JSON-LD script tag string for injection into <head>.
 * Pass the result via dangerouslySetInnerHTML.
 */
export function renderJsonLd(node: JsonLdNode | JsonLdNode[]): string {
	const nodes = Array.isArray(node) ? node : [node]
	return JSON.stringify(
		nodes.length === 1
			? { '@context': 'https://schema.org', ...nodes[0] }
			: { '@context': 'https://schema.org', '@graph': nodes },
	)
}

/**
 * Organization structured data for the store.
 */
export function makeOrganizationJsonLd({
	name,
	url,
	logo,
	description,
}: {
	name: string
	url: string
	logo?: string
	description?: string
}): JsonLdNode {
	return {
		'@type': 'Organization',
		name,
		url,
		...(description ? { description } : {}),
		...(logo ? { logo } : {}),
	}
}

/**
 * WebSite structured data for the home page.
 */
export function makeWebSiteJsonLd({
	name,
	url,
	description,
	potentialAction,
}: {
	name: string
	url: string
	description?: string
	potentialAction?: {
		target: string
		queryInput: string
	}
}): JsonLdNode {
	const result: JsonLdNode = {
		'@type': 'WebSite',
		name,
		url,
	}
	if (description) result.description = description
	if (potentialAction) {
		result.potentialAction = {
			'@type': 'SearchAction',
			target: {
				'@type': 'EntryPoint',
				urlTemplate: potentialAction.target,
			},
			'query-input': potentialAction.queryInput,
		}
	}
	return result
}

/**
 * Product structured data for product detail pages.
 */
export function makeProductJsonLd({
	name,
	description,
	sku,
	image,
	price,
	currency,
	url,
	availability,
	category,
	brand,
}: {
	name: string
	description?: string
	sku: string
	image?: string[]
	price: number // in cents
	currency: string
	url: string
	availability?: 'InStock' | 'OutOfStock' | 'PreOrder'
	category?: string
	brand?: string
}): Product {
	return {
		'@type': 'Product',
		name,
		...(description ? { description } : {}),
		sku,
		...(image?.length ? { image } : {}),
		...(brand ? { brand: { '@type': 'Brand' as const, name: brand } } : {}),
		...(category ? { category } : {}),
		offers: {
			'@type': 'Offer',
			price: (price / 100).toFixed(2),
			priceCurrency: currency,
			availability: `https://schema.org/${availability || 'InStock'}`,
			url,
		},
		url,
	}
}

/**
 * BreadcrumbList structured data.
 */
export function makeBreadcrumbListJsonLd(
	items: { name: string; url: string }[],
): JsonLdNode {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			item: item.url,
		})),
	}
}

/**
 * ItemList structured data for product listing pages.
 */
export function makeItemListJsonLd(
	items: { name: string; url: string; image?: string }[],
): JsonLdNode {
	return {
		'@type': 'ItemList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			url: item.url,
			...(item.image ? { image: item.image } : {}),
		})),
	}
}

/**
 * CollectionPage structured data for category pages.
 */
export function makeCollectionPageJsonLd({
	name,
	url,
	description,
	hasPart,
}: {
	name: string
	url: string
	description?: string
	hasPart?: { name: string; url: string }[]
}): JsonLdNode {
	const result: JsonLdNode = {
		'@type': 'CollectionPage',
		name,
		url,
	}
	if (description) result.description = description
	if (hasPart?.length) {
		result.hasPart = hasPart.map((p) => ({
			'@type': 'WebPage',
			name: p.name,
			url: p.url,
		}))
	}
	return result
}

/**
 * Generic WebPage for static pages (about, tos, privacy, support).
 */
export function makeWebPageJsonLd({
	name,
	url,
	description,
	pageType,
}: {
	name: string
	url: string
	description?: string
	pageType?: 'AboutPage' | 'ContactPage' | 'FAQPage'
}): JsonLdNode {
	return {
		'@type': pageType || 'WebPage',
		name,
		url,
		...(description ? { description } : {}),
	}
}
