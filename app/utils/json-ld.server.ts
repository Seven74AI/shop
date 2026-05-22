/**
 * JSON-LD structured data utilities.
 * Generates schema.org JSON-LD for SEO: Product, Organization,
 * BreadcrumbList, WebSite.
 *
 * All functions return plain objects — callers render them as
 * <script type="application/ld+json">{JSON.stringify(obj)}</script>.
 */

// ─── Schema.org type definitions ──────────────────────────────────

export type JsonLdContext = 'https://schema.org'

interface JsonLdThing {
	'@context': JsonLdContext
	'@type': string
}

export interface JsonLdOrganization extends JsonLdThing {
	'@type': 'Organization'
	name: string
	url: string
	logo?: string
	sameAs?: string[]
	contactPoint?: {
		'@type': 'ContactPoint'
		contactType: string
		email?: string
		telephone?: string
	}
}

export interface JsonLdWebSite extends JsonLdThing {
	'@type': 'WebSite'
	name: string
	url: string
	description?: string
	potentialAction?: {
		'@type': 'SearchAction'
		target: { '@type': 'EntryPoint'; urlTemplate: string }
		'query-input': string
	}
}

export interface JsonLdBreadcrumbList extends JsonLdThing {
	'@type': 'BreadcrumbList'
	itemListElement: Array<{
		'@type': 'ListItem'
		position: number
		name: string
		item: string
	}>
}

export interface JsonLdProduct extends JsonLdThing {
	'@type': 'Product'
	name: string
	description?: string
	sku: string
	image?: string[]
	offers?: {
		'@type': 'Offer'
		price: string
		priceCurrency: string
		availability: string
		url: string
	}
	category?: string
	brand?: {
		'@type': 'Brand' | 'Organization'
		name: string
	}
}

// ─── Builder functions ─────────────────────────────────────────────

/**
 * Build Organization JSON-LD.
 */
export function buildOrganizationLd(opts: {
	siteUrl: string
	name?: string
	logoUrl?: string
	sameAs?: string[]
	contactEmail?: string
}): JsonLdOrganization {
	const ld: JsonLdOrganization = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: opts.name ?? 'Epic Shop',
		url: opts.siteUrl,
	}

	if (opts.logoUrl) {
		ld.logo = opts.logoUrl
	}
	if (opts.sameAs?.length) {
		ld.sameAs = opts.sameAs
	}
	if (opts.contactEmail) {
		ld.contactPoint = {
			'@type': 'ContactPoint',
			contactType: 'customer service',
			email: opts.contactEmail,
		}
	}

	return ld
}

/**
 * Build WebSite JSON-LD (with Sitelinks Searchbox).
 */
export function buildWebSiteLd(opts: {
	siteUrl: string
	name?: string
	description?: string
}): JsonLdWebSite {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: opts.name ?? 'Epic Shop',
		url: opts.siteUrl,
		...(opts.description ? { description: opts.description } : {}),
		potentialAction: {
			'@type': 'SearchAction',
			target: {
				'@type': 'EntryPoint',
				urlTemplate: `${opts.siteUrl}/shop/products?search={search_term_string}`,
			},
			'query-input': 'required name=search_term_string',
		},
	}
}

/**
 * Build BreadcrumbList JSON-LD from an array of { name, href } items.
 */
export function buildBreadcrumbListLd(
	items: Array<{ name: string; href: string }>,
): JsonLdBreadcrumbList {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem' as const,
			position: index + 1,
			name: item.name,
			item: item.href,
		})),
	}
}

/**
 * Build Product JSON-LD.
 */
export function buildProductLd(opts: {
	siteUrl: string
	product: {
		name: string
		slug: string
		description?: string | null
		sku: string
		price: number // in cents
		status: string
	}
	currency: string
	imageUrls?: string[]
	categoryName?: string
	brandName?: string
}): JsonLdProduct {
	const productUrl = `${opts.siteUrl}/shop/products/${opts.product.slug}`
	const availability =
		opts.product.status === 'ACTIVE'
			? 'https://schema.org/InStock'
			: 'https://schema.org/OutOfStock'

	const ld: JsonLdProduct = {
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: opts.product.name,
		sku: opts.product.sku,
		offers: {
			'@type': 'Offer',
			price: (opts.product.price / 100).toFixed(2),
			priceCurrency: opts.currency,
			availability,
			url: productUrl,
		},
	}

	if (opts.product.description) {
		ld.description = opts.product.description
	}
	if (opts.imageUrls?.length) {
		ld.image = opts.imageUrls
	}
	if (opts.categoryName) {
		ld.category = opts.categoryName
	}
	if (opts.brandName) {
		ld.brand = { '@type': 'Brand', name: opts.brandName }
	}

	return ld
}

/**
 * Render a JSON-LD object to a <script> tag string.
 * Safe for server-rendered HTML.
 */
export function renderJsonLd(data: object): string {
	return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}
