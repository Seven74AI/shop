import { describe, expect, test } from 'vitest'
import {
	buildImageUrl,
	generateOgTags,
	generateTwitterCard,
	type OgCategoryInput,
	type OgHomepageInput,
	type OgProductInput,
} from './seo-meta.server.ts'

const SITE_URL = 'https://epicshop.example.com'

describe('generateOgTags — product', () => {
	const input: OgProductInput = {
		siteName: 'Epic Shop',
		siteUrl: SITE_URL,
		productName: 'Dragon T-Shirt',
		productDescription: 'A shirt with a dragon on it.',
		productImageUrl: `${SITE_URL}/resources/images?objectKey=shirt.png`,
		productPrice: '$ 29.99 USD',
		productUrl: `${SITE_URL}/shop/products/dragon-tshirt`,
	}

	test('includes og:type = product', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({ property: 'og:type', content: 'product' })
	})

	test('includes og:title from product name', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({ property: 'og:title', content: 'Dragon T-Shirt' })
	})

	test('includes og:url', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({
			property: 'og:url',
			content: `${SITE_URL}/shop/products/dragon-tshirt`,
		})
	})

	test('includes og:description when provided', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({
			property: 'og:description',
			content: 'A shirt with a dragon on it.',
		})
	})

	test('includes og:image when provided', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({
			property: 'og:image',
			content: `${SITE_URL}/resources/images?objectKey=shirt.png`,
		})
	})

	test('includes product:price:amount when provided', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({
			property: 'product:price:amount',
			content: '$ 29.99 USD',
		})
	})

	test('includes og:site_name', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({ property: 'og:site_name', content: 'Epic Shop' })
	})

	test('omits og:description when undefined', () => {
		const tags = generateOgTags({ ...input, productDescription: undefined })
		expect(tags.find((t) => t.property === 'og:description')).toBeUndefined()
	})

	test('omits og:image when null', () => {
		const tags = generateOgTags({ ...input, productImageUrl: null })
		expect(tags.find((t) => t.property === 'og:image')).toBeUndefined()
	})

	test('omits product:price:amount when undefined', () => {
		const tags = generateOgTags({ ...input, productPrice: undefined })
		expect(tags.find((t) => t.property === 'product:price:amount')).toBeUndefined()
	})
})

describe('generateOgTags — category', () => {
	const input: OgCategoryInput = {
		siteName: 'Epic Shop',
		siteUrl: SITE_URL,
		categoryName: 'T-Shirts',
		categoryDescription: 'All our cotton tees.',
		categoryUrl: `${SITE_URL}/shop/categories/tshirts`,
	}

	test('includes og:type = website', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({ property: 'og:type', content: 'website' })
	})

	test('includes og:title with category name and site name', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({
			property: 'og:title',
			content: 'T-Shirts — Epic Shop',
		})
	})

	test('includes og:description when provided', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({
			property: 'og:description',
			content: 'All our cotton tees.',
		})
	})
})

describe('generateOgTags — homepage', () => {
	const input: OgHomepageInput = {
		siteName: 'Epic Shop',
		siteUrl: SITE_URL,
		tagline: 'Your one-stop shop for epic stuff.',
		homepageUrl: `${SITE_URL}/shop`,
	}

	test('includes og:type = website', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({ property: 'og:type', content: 'website' })
	})

	test('includes og:title from site name', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({ property: 'og:title', content: 'Epic Shop' })
	})

	test('includes og:url from homepage url', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({ property: 'og:url', content: `${SITE_URL}/shop` })
	})

	test('includes og:description from tagline when provided', () => {
		const tags = generateOgTags(input)
		expect(tags).toContainEqual({
			property: 'og:description',
			content: 'Your one-stop shop for epic stuff.',
		})
	})
})

describe('generateTwitterCard', () => {
	test('always includes summary_large_image', () => {
		const tags = generateTwitterCard()
		expect(tags).toContainEqual({
			name: 'twitter:card',
			content: 'summary_large_image',
		})
	})

	test('includes twitter:site when provided', () => {
		const tags = generateTwitterCard({ site: '@epicshop' })
		expect(tags).toContainEqual({ name: 'twitter:site', content: '@epicshop' })
	})

	test('includes twitter:creator when provided', () => {
		const tags = generateTwitterCard({ creator: '@someauthor' })
		expect(tags).toContainEqual({ name: 'twitter:creator', content: '@someauthor' })
	})

	test('omits twitter:site when not provided', () => {
		const tags = generateTwitterCard()
		expect(tags.find((t) => t.name === 'twitter:site')).toBeUndefined()
	})
})

describe('buildImageUrl', () => {
	test('builds an absolute URL from objectKey and domain', () => {
		expect(buildImageUrl('products/tee.png', SITE_URL)).toBe(
			`${SITE_URL}/resources/images?objectKey=products%2Ftee.png`,
		)
	})
})
