/**
 * SEO meta tag generators for OpenGraph and Twitter Cards.
 *
 * Generates meta tag objects compatible with React Router's
 * `Route.MetaFunction` return type.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OgProductInput {
	siteName: string
	siteUrl: string
	productName: string
	productDescription?: string | null
	productImageUrl?: string | null
	productPrice?: string // formatted price (e.g. "$ 29.99 USD")
	productUrl: string
}

export interface OgCategoryInput {
	siteName: string
	siteUrl: string
	categoryName: string
	categoryDescription?: string | null
	categoryUrl: string
}

export interface OgHomepageInput {
	siteName: string
	siteUrl: string
	tagline?: string
	homepageUrl: string
}

export interface TwitterCardInput {
	site?: string // @username of the website
	creator?: string // @username of the content creator
}

export type OgMetaTag = { property: string; content: string }
export type TwitterMetaTag = { name: string; content: string }
export type PageMeta = OgMetaTag | TwitterMetaTag

// ---------------------------------------------------------------------------
// OpenGraph
// ---------------------------------------------------------------------------

export function generateOgTags(input: OgProductInput | OgCategoryInput | OgHomepageInput): OgMetaTag[] {
	const tags: OgMetaTag[] = []

	if ('productName' in input) {
		// Product page
		tags.push(
			{ property: 'og:type', content: 'product' },
			{ property: 'og:title', content: input.productName },
			{ property: 'og:url', content: input.productUrl },
			{ property: 'og:site_name', content: input.siteName },
		)
		if (input.productDescription) {
			tags.push({ property: 'og:description', content: input.productDescription })
		}
		if (input.productImageUrl) {
			tags.push({ property: 'og:image', content: input.productImageUrl })
		}
		if (input.productPrice) {
			tags.push({ property: 'product:price:amount', content: input.productPrice })
		}
	} else if ('categoryName' in input) {
		// Category page
		tags.push(
			{ property: 'og:type', content: 'website' },
			{ property: 'og:title', content: `${input.categoryName} — ${input.siteName}` },
			{ property: 'og:url', content: input.categoryUrl },
			{ property: 'og:site_name', content: input.siteName },
		)
		if (input.categoryDescription) {
			tags.push({ property: 'og:description', content: input.categoryDescription })
		}
	} else {
		// Homepage
		tags.push(
			{ property: 'og:type', content: 'website' },
			{ property: 'og:title', content: input.siteName },
			{ property: 'og:url', content: input.homepageUrl },
			{ property: 'og:site_name', content: input.siteName },
		)
		if (input.tagline) {
			tags.push({ property: 'og:description', content: input.tagline })
		}
	}

	return tags
}

// ---------------------------------------------------------------------------
// Twitter Card
// ---------------------------------------------------------------------------

export function generateTwitterCard(input: TwitterCardInput = {}): TwitterMetaTag[] {
	const tags: TwitterMetaTag[] = [
		{ name: 'twitter:card', content: 'summary_large_image' },
	]
	if (input.site) {
		tags.push({ name: 'twitter:site', content: input.site })
	}
	if (input.creator) {
		tags.push({ name: 'twitter:creator', content: input.creator })
	}

	return tags
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an absolute image URL from an object key and domain.
 */
export function buildImageUrl(objectKey: string, domainUrl: string): string {
	return `${domainUrl}/resources/images?objectKey=${encodeURIComponent(objectKey)}`
}
