import { describe, test, expect, vi, beforeEach } from 'vitest'
import { generateSitemap } from './sitemap.server.ts'

// Mock the prisma call to return known data
vi.mock('./db.server.ts', () => ({
	prisma: {
		product: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		category: {
			findMany: vi.fn().mockResolvedValue([]),
		},
		settings: {
			findUnique: vi.fn().mockResolvedValue({ id: 'settings', currencyId: 'usd-1' }),
			upsert: vi.fn(),
		},
		currency: {
			upsert: vi.fn().mockResolvedValue({ id: 'usd-1', code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 }),
		},
		$disconnect: vi.fn(),
	},
}))

import { prisma } from './db.server.ts'

const mockedPrisma = prisma as unknown as {
	product: { findMany: ReturnType<typeof vi.fn> }
	category: { findMany: ReturnType<typeof vi.fn> }
}

function makeBuild(routes: Array<{ id: string; path?: string; index?: boolean; parentId?: string }>) {
	const routeMap: Record<string, unknown> = {}
	for (const r of routes) {
		routeMap[r.id] = {
			id: r.id,
			path: r.path,
			index: r.index,
			...(r.parentId ? { parentId: r.parentId } : {}),
		}
	}
	return {
		routes: routeMap,
	} as unknown as import('react-router').ServerBuild
}

describe('generateSitemap', () => {
	beforeEach(() => {
		mockedPrisma.product.findMany.mockReset().mockResolvedValue([])
		mockedPrisma.category.findMany.mockReset().mockResolvedValue([])
	})

	test('includes only public static routes', async () => {
		const build = makeBuild([
			{ id: 'root', path: '/', index: true },
			{ id: 'shop', path: '/shop' },
			{ id: 'shop-products', path: '/shop/products' },
			{ id: 'admin', path: '/admin' },
			{ id: 'login', path: '/login' },
		])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain('<loc>https://epic.shop/</loc>')
		expect(sitemap).toContain('<loc>https://epic.shop/shop</loc>')
		expect(sitemap).toContain('<loc>https://epic.shop/shop/products</loc>')
		expect(sitemap).not.toContain('/admin')
		expect(sitemap).not.toContain('/login')
	})

	test('has XML declaration and urlset root', async () => {
		const build = makeBuild([{ id: 'root', path: '/', index: true }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>')
		expect(sitemap).toContain(
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		)
		expect(sitemap).toContain('</urlset>')
	})

	test('each url has changefreq and priority', async () => {
		const build = makeBuild([{ id: 'root', path: '/', index: true }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain('<changefreq>')
		expect(sitemap).toContain('<priority>')
	})

	test('root page has priority 1.0 and changefreq daily', async () => {
		const build = makeBuild([{ id: 'root', path: '/', index: true }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain('<priority>1.0</priority>')
		expect(sitemap).toContain('<changefreq>daily</changefreq>')
	})

	test('product listing has priority 0.9 and changefreq daily', async () => {
		const build = makeBuild([{ id: 'shop-products', path: '/shop/products' }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain('<priority>0.9</priority>')
		expect(sitemap).toContain('<changefreq>daily</changefreq>')
	})

	test('cart page has low priority', async () => {
		const build = makeBuild([{ id: 'cart', path: '/shop/cart' }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain('<priority>0.3</priority>')
		expect(sitemap).toContain('<changefreq>weekly</changefreq>')
	})

	test('dynamic product routes include lastmod from updatedAt', async () => {
		const updatedAt = new Date('2025-06-15T10:00:00.000Z')
		mockedPrisma.product.findMany.mockResolvedValue([
			{ slug: 'test-product', updatedAt },
		])

		const build = makeBuild([{ id: 'root', path: '/', index: true }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain('<loc>https://epic.shop/shop/products/test-product</loc>')
		expect(sitemap).toContain('<lastmod>2025-06-15T10:00:00.000Z</lastmod>')
		expect(sitemap).toContain('<changefreq>weekly</changefreq>')
		expect(sitemap).toContain('<priority>0.8</priority>')
	})

	test('dynamic category routes include lastmod from updatedAt', async () => {
		const updatedAt = new Date('2025-05-01T00:00:00.000Z')
		mockedPrisma.category.findMany.mockResolvedValue([
			{ slug: 'electronics', updatedAt },
		])

		const build = makeBuild([{ id: 'root', path: '/', index: true }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain(
			'<loc>https://epic.shop/shop/categories/electronics</loc>',
		)
		expect(sitemap).toContain('<lastmod>2025-05-01T00:00:00.000Z</lastmod>')
		expect(sitemap).toContain('<changefreq>weekly</changefreq>')
		expect(sitemap).toContain('<priority>0.7</priority>')
	})

	test('dynamic routes do not duplicate static parametric routes', async () => {
		mockedPrisma.product.findMany.mockResolvedValue([
			{ slug: 'test-product', updatedAt: new Date('2025-01-01T00:00:00.000Z') },
		])

		const build = makeBuild([
			{ id: 'root', path: '/', index: true },
			{ id: 'product-detail', path: '/shop/products/$slug' },
		])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		// Should only have the product URL once
		const matches = (
			sitemap.match(/\/shop\/products\/test-product/g) || []
		)
		expect(matches.length).toBe(1)
	})

	test('handles empty database gracefully', async () => {
		mockedPrisma.product.findMany.mockResolvedValue([])
		mockedPrisma.category.findMany.mockResolvedValue([])

		const build = makeBuild([
			{ id: 'root', path: '/', index: true },
			{ id: 'shop', path: '/shop' },
		])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		expect(sitemap).toContain('</urlset>')
		expect(sitemap).toContain('<loc>https://epic.shop/</loc>')
	})

	test('handles database errors gracefully', async () => {
		mockedPrisma.product.findMany.mockRejectedValue(new Error('DB down'))

		const build = makeBuild([{ id: 'root', path: '/', index: true }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		// Should still produce valid XML with static routes
		expect(sitemap).toContain('</urlset>')
		expect(sitemap).toContain('<loc>https://epic.shop/</loc>')
	})

	test('escaping XML special characters in URLs', async () => {
		const build = makeBuild([{ id: 'root', path: '/', index: true }])

		const sitemap = await generateSitemap(build, 'https://epic.shop')

		// No unescaped ampersands in the XML
		expect(sitemap).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
	})
})
