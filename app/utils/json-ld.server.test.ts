import { describe, test, expect } from 'vitest'
import {
	buildOrganizationLd,
	buildWebSiteLd,
	buildBreadcrumbListLd,
	buildProductLd,
	renderJsonLd,
} from './json-ld.server.ts'

describe('renderJsonLd', () => {
	test('wraps data in script tag with application/ld+json type', () => {
		const result = renderJsonLd({ '@type': 'WebSite', url: 'https://example.com' })

		expect(result).toContain('<script type="application/ld+json">')
		expect(result).toContain('</script>')
	})

	test('escapes HTML special characters in JSON-LD strings', () => {
		const result = renderJsonLd({
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: 'Shop & Go <Fast>',
			url: 'https://shop.com',
		})

		const match = result.match(
			/<script type="application\/ld\+json">(.+)<\/script>/s,
		)
		expect(match).not.toBeNull()
		const parsed = JSON.parse(match![1]!) as { name: string }
		expect(parsed.name).toBe('Shop & Go <Fast>')
	})

	test('does not nest <script> tags (safe against XSS)', () => {
		const result = renderJsonLd({
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: 'Epic</script><script>alert("xss")</script>Shop',
			url: 'https://epic.shop',
		})

		const scriptTags = result.match(/<script/g)
		expect(scriptTags).toHaveLength(1)
		expect(result).not.toContain('alert("xss")')
	})
})

describe('buildOrganizationLd', () => {
	test('builds minimal Organization with name and url', () => {
		const result = buildOrganizationLd({ siteUrl: 'https://epic.shop' })

		expect(result['@context']).toBe('https://schema.org')
		expect(result['@type']).toBe('Organization')
		expect(result.name).toBe('Epic Shop')
		expect(result.url).toBe('https://epic.shop')
	})

	test('accepts custom name', () => {
		const result = buildOrganizationLd({
			siteUrl: 'https://epic.shop',
			name: 'Custom Shop',
		})

		expect(result.name).toBe('Custom Shop')
	})

	test('includes logo when provided', () => {
		const result = buildOrganizationLd({
			siteUrl: 'https://epic.shop',
			logoUrl: 'https://epic.shop/logo.png',
		})

		expect(result.logo).toBe('https://epic.shop/logo.png')
	})

	test('includes sameAs when provided', () => {
		const result = buildOrganizationLd({
			siteUrl: 'https://epic.shop',
			sameAs: ['https://twitter.com/epicshop', 'https://github.com/epicshop'],
		})

		expect(result.sameAs).toEqual([
			'https://twitter.com/epicshop',
			'https://github.com/epicshop',
		])
	})

	test('includes contactPoint when email provided', () => {
		const result = buildOrganizationLd({
			siteUrl: 'https://epic.shop',
			contactEmail: 'support@epic.shop',
		})

		expect(result.contactPoint).toEqual({
			'@type': 'ContactPoint',
			contactType: 'customer service',
			email: 'support@epic.shop',
		})
	})

	test('omits optional fields when not provided', () => {
		const result = buildOrganizationLd({ siteUrl: 'https://epic.shop' })

		expect(result).not.toHaveProperty('logo')
		expect(result).not.toHaveProperty('sameAs')
		expect(result).not.toHaveProperty('contactPoint')
	})
})

describe('buildWebSiteLd', () => {
	test('builds WebSite with search action', () => {
		const result = buildWebSiteLd({ siteUrl: 'https://epic.shop' })

		expect(result['@context']).toBe('https://schema.org')
		expect(result['@type']).toBe('WebSite')
		expect(result.name).toBe('Epic Shop')
		expect(result.url).toBe('https://epic.shop')
		expect(result.potentialAction).toBeDefined()
		expect(result.potentialAction!['@type']).toBe('SearchAction')
		expect(result.potentialAction!.target.urlTemplate).toContain(
			'search_term_string',
		)
	})

	test('includes description when provided', () => {
		const result = buildWebSiteLd({
			siteUrl: 'https://epic.shop',
			description: 'The best shop',
		})

		expect(result.description).toBe('The best shop')
	})
})

describe('buildBreadcrumbListLd', () => {
	test('builds breadcrumb with correct positions', () => {
		const result = buildBreadcrumbListLd([
			{ name: 'Home', href: 'https://epic.shop/' },
			{ name: 'Products', href: 'https://epic.shop/shop/products' },
			{ name: 'Headphones', href: 'https://epic.shop/shop/products/headphones' },
		])

		expect(result['@context']).toBe('https://schema.org')
		expect(result['@type']).toBe('BreadcrumbList')
		expect(result.itemListElement).toHaveLength(3)
		expect(result.itemListElement[0]).toEqual({
			'@type': 'ListItem',
			position: 1,
			name: 'Home',
			item: 'https://epic.shop/',
		})
		expect(result.itemListElement[2]).toEqual({
			'@type': 'ListItem',
			position: 3,
			name: 'Headphones',
			item: 'https://epic.shop/shop/products/headphones',
		})
	})

	test('handles single-item breadcrumb', () => {
		const result = buildBreadcrumbListLd([
			{ name: 'Home', href: 'https://epic.shop/' },
		])

		const firstItem = result.itemListElement[0]
		expect(firstItem).toBeDefined()
		expect(firstItem!.position).toBe(1)
	})
})

describe('buildProductLd', () => {
	test('builds Product with correct structure', () => {
		const result = buildProductLd({
			siteUrl: 'https://epic.shop',
			product: {
				name: 'Wireless Headphones',
				slug: 'wireless-headphones',
				description: 'Premium noise-cancelling headphones',
				sku: 'SKU-001',
				price: 7999,
				status: 'ACTIVE',
			},
			currency: 'USD',
		})

		expect(result['@context']).toBe('https://schema.org')
		expect(result['@type']).toBe('Product')
		expect(result.name).toBe('Wireless Headphones')
		expect(result.sku).toBe('SKU-001')
		expect(result.description).toBe('Premium noise-cancelling headphones')
		expect(result.offers).toBeDefined()
		expect(result.offers!['@type']).toBe('Offer')
		expect(result.offers!.price).toBe('79.99')
		expect(result.offers!.priceCurrency).toBe('USD')
		expect(result.offers!.availability).toBe('https://schema.org/InStock')
		expect(result.offers!.url).toBe(
			'https://epic.shop/shop/products/wireless-headphones',
		)
	})

	test('price divides cents correctly', () => {
		const result = buildProductLd({
			siteUrl: 'https://epic.shop',
			product: {
				name: 'Cheap Item',
				slug: 'cheap',
				sku: 'SKU-002',
				price: 50,
				status: 'ACTIVE',
			},
			currency: 'USD',
		})

		expect(result.offers!.price).toBe('0.50')
	})

	test('uses OutOfStock for non-ACTIVE products', () => {
		const result = buildProductLd({
			siteUrl: 'https://epic.shop',
			product: {
				name: 'Sold Out',
				slug: 'sold-out',
				sku: 'SKU-003',
				price: 1000,
				status: 'DRAFT',
			},
			currency: 'USD',
		})

		expect(result.offers!.availability).toBe('https://schema.org/OutOfStock')
	})

	test('includes image URLs when provided', () => {
		const result = buildProductLd({
			siteUrl: 'https://epic.shop',
			product: {
				name: 'Test',
				slug: 'test',
				sku: 'SKU-004',
				price: 1000,
				status: 'ACTIVE',
			},
			currency: 'USD',
			imageUrls: ['https://epic.shop/img/1.jpg', 'https://epic.shop/img/2.jpg'],
		})

		expect(result.image).toEqual([
			'https://epic.shop/img/1.jpg',
			'https://epic.shop/img/2.jpg',
		])
	})

	test('includes category when provided', () => {
		const result = buildProductLd({
			siteUrl: 'https://epic.shop',
			product: {
				name: 'Test',
				slug: 'test',
				sku: 'SKU-005',
				price: 1000,
				status: 'ACTIVE',
			},
			currency: 'USD',
			categoryName: 'Electronics',
		})

		expect(result.category).toBe('Electronics')
	})

	test('includes brand when provided', () => {
		const result = buildProductLd({
			siteUrl: 'https://epic.shop',
			product: {
				name: 'Test',
				slug: 'test',
				sku: 'SKU-006',
				price: 1000,
				status: 'ACTIVE',
			},
			currency: 'USD',
			brandName: 'Epic Shop',
		})

		expect(result.brand).toEqual({
			'@type': 'Brand',
			name: 'Epic Shop',
		})
	})

	test('omits optional fields when not provided', () => {
		const result = buildProductLd({
			siteUrl: 'https://epic.shop',
			product: {
				name: 'Minimal',
				slug: 'minimal',
				sku: 'SKU-MIN',
				price: 100,
				status: 'ACTIVE',
			},
			currency: 'USD',
		})

		expect(result).not.toHaveProperty('description')
		expect(result).not.toHaveProperty('image')
		expect(result).not.toHaveProperty('category')
		expect(result).not.toHaveProperty('brand')
	})
})
