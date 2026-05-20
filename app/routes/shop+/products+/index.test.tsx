/**
 * @vitest-environment jsdom
 */
import { test, expect, beforeEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { ensureFts5Migration } from '#tests/fts5-utils.ts'
import { loader } from './index.tsx'

// ─── Test Data ─────────────────────────────────────────────────────────────

let electronicsId: string

async function createTestData() {
	await prisma.productImage.deleteMany()
	await prisma.productToTag.deleteMany()
	await prisma.cartItem.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.productTag.deleteMany()

	const electronics = await prisma.category.create({
		data: { name: 'Electronics', slug: 'electronics' },
	})
	const clothing = await prisma.category.create({
		data: { name: 'Clothing', slug: 'clothing' },
	})
	const books = await prisma.category.create({
		data: { name: 'Books', slug: 'books' },
	})
	electronicsId = electronics.id

	await prisma.product.create({
		data: { name: 'Wireless Bluetooth Headphones', slug: 'wh-1000', description: 'Premium noise-cancelling wireless headphones.', sku: 'SKU-HP001', price: 7999, status: 'ACTIVE', categoryId: electronics.id },
	})
	await prisma.product.create({
		data: { name: 'USB-C Charging Cable 2m', slug: 'usb-c-cable', description: 'Fast-charging braided USB-C cable.', sku: 'SKU-CB001', price: 1299, status: 'ACTIVE', categoryId: electronics.id },
	})
	await prisma.product.create({
		data: { name: 'Organic Cotton T-Shirt', slug: 'cotton-tshirt', description: 'Comfortable organic cotton t-shirt.', sku: 'SKU-CT001', price: 2499, status: 'ACTIVE', categoryId: clothing.id },
	})
	await prisma.product.create({
		data: { name: 'Winter Wool Jacket', slug: 'wool-jacket', description: 'Warm wool blend winter jacket.', sku: 'SKU-CJ001', price: 14999, status: 'ACTIVE', categoryId: clothing.id },
	})
	await prisma.product.create({
		data: { name: 'JavaScript: The Good Parts', slug: 'js-good-parts', description: 'Classic programming book.', sku: 'SKU-BK001', price: 2999, status: 'ACTIVE', categoryId: books.id },
	})
	await prisma.product.create({
		data: { name: 'Draft Product', slug: 'draft-product', description: 'Should not appear.', sku: 'SKU-DR001', price: 999, status: 'DRAFT', categoryId: books.id },
	})

	await ensureFts5Migration()
}

beforeEach(async () => {
	await ensureFts5Migration()
	await createTestData()
})

// ─── Search / Filter Tests ─────────────────────────────────────────────────

function loaderArgs(request: Request) {
	const url = new URL(request.url)
	return { request, params: {} as Record<string, string>, context: {}, url, pattern: '' as const }
}

test('returns all active products by default', async () => {
	const request = new Request('http://localhost/shop/products')
	const data = await loader(loaderArgs(request))
	expect(data.totalCount).toBe(5)
	expect(data.products).toHaveLength(5)
})

test('search query returns matching products', async () => {
	const request = new Request('http://localhost/shop/products?q=headphones')
	const data = await loader(loaderArgs(request))
	expect(data.totalCount).toBe(1)
	expect(data.products[0]!.name).toBe('Wireless Bluetooth Headphones')
})

test('filters by category via URL param', async () => {
	const request = new Request(`http://localhost/shop/products?category=${electronicsId}`)
	const data = await loader(loaderArgs(request))
	expect(data.totalCount).toBe(2)
	expect(data.products.every((p) => p.categoryId === electronicsId)).toBe(true)
})

test('filters by price range via URL params', async () => {
	const request = new Request('http://localhost/shop/products?minPrice=10000&maxPrice=20000')
	const data = await loader(loaderArgs(request))
	expect(data.totalCount).toBe(1)
	expect(data.products[0]!.name).toBe('Winter Wool Jacket')
})

test('sorts by price ascending', async () => {
	const request = new Request('http://localhost/shop/products?sort=price_asc')
	const data = await loader(loaderArgs(request))
	expect(data.products.length).toBeGreaterThan(0)
	for (let i = 1; i < data.products.length; i++) {
		expect(data.products[i]!.price).toBeGreaterThanOrEqual(data.products[i - 1]!.price)
	}
})

test('excludes draft products by default', async () => {
	const request = new Request('http://localhost/shop/products')
	const data = await loader(loaderArgs(request))
	expect(data.products.some((p) => p.status === 'DRAFT')).toBe(false)
})

test('empty search query returns all active products', async () => {
	const request = new Request('http://localhost/shop/products?q=')
	const data = await loader(loaderArgs(request))
	expect(data.totalCount).toBe(5)
})

test('no-match search returns empty results', async () => {
	const request = new Request('http://localhost/shop/products?q=xyznonexistent123')
	const data = await loader(loaderArgs(request))
	expect(data.totalCount).toBe(0)
	expect(data.products).toHaveLength(0)
})

test('facets update when search query filters results', async () => {
	const request = new Request('http://localhost/shop/products?q=headphones')
	const data = await loader(loaderArgs(request))
	const electronicsFacet = data.facets.categories.find((f) => f.name === 'Electronics')
	expect(electronicsFacet).toBeDefined()
	expect(electronicsFacet!.count).toBe(1)
})

test('returns category facet counts', async () => {
	const request = new Request('http://localhost/shop/products')
	const data = await loader(loaderArgs(request))
	expect(data.facets.categories.length).toBeGreaterThan(0)
	const electronicsFacet = data.facets.categories.find((f) => f.name === 'Electronics')
	expect(electronicsFacet!.count).toBe(2)
})

test('returns price range facet counts', async () => {
	const request = new Request('http://localhost/shop/products')
	const data = await loader(loaderArgs(request))
	expect(data.facets.priceRanges).toHaveLength(5)
})

test('passes active query to component via loader data', async () => {
	const request = new Request('http://localhost/shop/products?q=headphones')
	const data = await loader(loaderArgs(request))
	expect(data.activeQuery).toBe('headphones')
})

test('passes active filter state to component via loader data', async () => {
	const request = new Request(`http://localhost/shop/products?category=${electronicsId}&sort=price_desc`)
	const data = await loader(loaderArgs(request))
	expect(data.activeCategoryId).toBe(electronicsId)
	expect(data.activeSort).toBe('price_desc')
})
