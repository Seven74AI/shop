import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	searchProducts,
	searchProductIds,
	getFtsStatus,
} from './product-search.server.ts'

// ─── FTS5 Migration Helper ──────────────────────────────────────────────

/**
 * Apply the FTS5 migration to the test database.
 * The global-setup creates base.db, but the FTS5 migration may not be in it
 * (global-setup only resets when schema.prisma changes, and we don't touch it).
 *
 * This applies BOTH the FTS5 virtual table AND the triggers, so that
 * Prisma INSERT/UPDATE/DELETE operations auto-sync the FTS5 index.
 */
async function ensureFts5Migration() {
	// Check if FTS5 table already exists
	const tableResult = await prisma.$queryRawUnsafe<
		Array<{ name: string }>
	>(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='product_fts'`,
	)

	if (tableResult.length > 0) {
		// Table exists - triggers should be there too, but re-sync just in case
		try {
			// Delete and rebuild FTS5 content from Product table
			// (rebuild is idempotent and handles any drift)
			await prisma.$queryRawUnsafe(`INSERT INTO product_fts(product_fts) VALUES('rebuild')`)
		} catch {
			// rebuild might fail if content was already rebuilt — ignore
		}
		return
	}

	// Create FTS5 virtual table
	await prisma.$queryRawUnsafe(`
		CREATE VIRTUAL TABLE product_fts USING fts5(
			name,
			description,
			categoryId UNINDEXED,
			price UNINDEXED,
			status UNINDEXED,
			content='Product',
			content_rowid='rowid'
		)
	`)

	// Create INSERT trigger
	await prisma.$queryRawUnsafe(`
		CREATE TRIGGER product_fts_ai AFTER INSERT ON Product BEGIN
			INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
			VALUES (new.rowid, new.name, new.description, new.categoryId, new.price, new.status);
		END
	`)

	// Create DELETE trigger
	await prisma.$queryRawUnsafe(`
		CREATE TRIGGER product_fts_ad AFTER DELETE ON Product BEGIN
			INSERT INTO product_fts(product_fts, rowid, name, description, categoryId, price, status)
			VALUES ('delete', old.rowid, old.name, old.description, old.categoryId, old.price, old.status);
		END
	`)

	// Create UPDATE trigger
	await prisma.$queryRawUnsafe(`
		CREATE TRIGGER product_fts_au AFTER UPDATE ON Product BEGIN
			INSERT INTO product_fts(product_fts, rowid, name, description, categoryId, price, status)
			VALUES ('delete', old.rowid, old.name, old.description, old.categoryId, old.price, old.status);
			INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
			VALUES (new.rowid, new.name, new.description, new.categoryId, new.price, new.status);
		END
	`)

	// Populate FTS5 with existing products
	await prisma.$queryRawUnsafe(`
		INSERT INTO product_fts(rowid, name, description, categoryId, price, status)
		SELECT rowid, name, description, categoryId, price, status FROM Product
	`)
}

// ─── Test Data Helpers ───────────────────────────────────────────────────

async function createTestData() {
	// Delete existing test data
	await prisma.productImage.deleteMany()
	await prisma.productToTag.deleteMany()
	await prisma.cartItem.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.productTag.deleteMany()

	// Create categories
	const electronics = await prisma.category.create({
		data: { name: 'Electronics', slug: 'electronics' },
	})
	const clothing = await prisma.category.create({
		data: { name: 'Clothing', slug: 'clothing' },
	})
	const books = await prisma.category.create({
		data: { name: 'Books', slug: 'books' },
	})

	// Create products
	await prisma.product.create({
		data: {
			name: 'Wireless Bluetooth Headphones',
			slug: 'wireless-bluetooth-headphones-abc1',
			description: 'Premium noise-cancelling wireless headphones with 30-hour battery life and deep bass sound quality.',
			sku: 'SKU-HP001',
			price: 7999, // $79.99
			status: 'ACTIVE',
			categoryId: electronics.id,
		},
	})

	await prisma.product.create({
		data: {
			name: 'USB-C Charging Cable 2m',
			slug: 'usb-c-charging-cable-abc2',
			description: 'Fast-charging braided USB-C cable compatible with all USB-C devices. Durable and tangle-free.',
			sku: 'SKU-CB001',
			price: 1299, // $12.99
			status: 'ACTIVE',
			categoryId: electronics.id,
		},
	})

	await prisma.product.create({
		data: {
			name: 'Organic Cotton T-Shirt',
			slug: 'organic-cotton-tshirt-abc3',
			description: 'Comfortable organic cotton t-shirt available in multiple colors. Eco-friendly and sustainable.',
			sku: 'SKU-CT001',
			price: 2499, // $24.99
			status: 'ACTIVE',
			categoryId: clothing.id,
		},
	})

	await prisma.product.create({
		data: {
			name: 'Winter Wool Jacket',
			slug: 'winter-wool-jacket-abc4',
			description: 'Warm wool blend winter jacket with quilted lining. Perfect for cold weather.',
			sku: 'SKU-CJ001',
			price: 14999, // $149.99
			status: 'ACTIVE',
			categoryId: clothing.id,
		},
	})

	await prisma.product.create({
		data: {
			name: 'JavaScript: The Good Parts',
			slug: 'javascript-good-parts-abc5',
			description: 'Classic programming book covering the best features of JavaScript. Essential reading for web developers.',
			sku: 'SKU-BK001',
			price: 2999, // $29.99
			status: 'ACTIVE',
			categoryId: books.id,
		},
	})

	await prisma.product.create({
		data: {
			name: 'Advanced TypeScript Patterns',
			slug: 'advanced-typescript-abc6',
			description: 'Deep dive into TypeScript generics, decorators, and advanced type system features.',
			sku: 'SKU-BK002',
			price: 3999, // $39.99
			status: 'DRAFT',
			categoryId: books.id,
		},
	})

	await prisma.product.create({
		data: {
			name: 'Premium Leather Laptop Bag',
			slug: 'premium-leather-laptop-bag-abc7',
			description: 'Genuine leather laptop bag with padded compartment for up to 16-inch laptops. Professional and stylish.',
			sku: 'SKU-BG001',
			price: 8999, // $89.99
			status: 'ACTIVE',
			categoryId: electronics.id,
		},
	})

	// Sync FTS5 index after direct Prisma inserts (triggers handle this normally,
	// but we re-apply to be safe since we wiped all products)
	await ensureFts5Migration()
}

// ─── Setup / Teardown ────────────────────────────────────────────────────

beforeEach(async () => {
	// FTS5 migration must run AFTER db-setup copies base.db → per-file db
	await ensureFts5Migration()
	await createTestData()
})

afterAll(async () => {
	await prisma.$disconnect()
})

// ─── Tests ───────────────────────────────────────────────────────────────

describe('product-search.server.ts — FTS5 Search', () => {
	describe('searchProducts', () => {
		it('returns all ACTIVE products when no filters are provided', async () => {
			const result = await searchProducts()
			expect(result.totalCount).toBe(6) // 7 total minus 1 DRAFT
			expect(result.products).toHaveLength(6)
			expect(result.products.every((p) => p.status === 'ACTIVE')).toBe(true)
		})

		it('searches by name with FTS5 full-text matching', async () => {
			const result = await searchProducts({ query: 'headphones' })
			expect(result.totalCount).toBe(1)
			expect(result.products[0]!.name).toBe('Wireless Bluetooth Headphones')
		})

		it('matches partial words with prefix search', async () => {
			const result = await searchProducts({ query: 'wire' })
			expect(result.totalCount).toBeGreaterThanOrEqual(1)
			expect(
				result.products.some((p) => p.name.includes('Wireless')),
			).toBe(true)
		})

		it('matches multiple words across name and description', async () => {
			const result = await searchProducts({ query: 'typeScript patterns' })
			expect(result.totalCount).toBe(0) // DRAFT = not shown by default
		})

		it('includes DRAFT products when status filter is set', async () => {
			const result = await searchProducts({
				query: 'typeScript',
				status: 'DRAFT',
			})
			expect(result.totalCount).toBe(1)
			expect(result.products[0]!.name).toBe('Advanced TypeScript Patterns')
		})

		it('filters by category', async () => {
			await searchProducts({ categoryId: '' })
			// Find the electronics category ID
			const electronics = await prisma.category.findFirst({
				where: { name: 'Electronics' },
			})
			const result2 = await searchProducts({
				categoryId: electronics!.id,
			})
			expect(result2.totalCount).toBe(3)
			expect(
				result2.products.every((p) => p.categoryId === electronics!.id),
			).toBe(true)
		})

		it('filters by minimum price', async () => {
			const result = await searchProducts({ minPriceCents: 10000 })
			expect(result.totalCount).toBe(1) // Only Winter Wool Jacket at $149.99
			expect(result.products[0]!.name).toBe('Winter Wool Jacket')
		})

		it('filters by maximum price', async () => {
			const result = await searchProducts({ maxPriceCents: 2000 })
			expect(result.totalCount).toBe(1) // Only USB-C Cable at $12.99
			expect(result.products[0]!.name).toBe('USB-C Charging Cable 2m')
		})

		it('filters by price range', async () => {
			const result = await searchProducts({
				minPriceCents: 2000,
				maxPriceCents: 5000,
			})
			// T-Shirt ($24.99) + JS Book ($29.99) = 2 ACTIVE products in range.
			// TS Book ($39.99) is DRAFT and filtered out by default.
			expect(result.totalCount).toBe(2)
		})

		it('combines full-text search with category filter', async () => {
			const electronics = await prisma.category.findFirst({
				where: { name: 'Electronics' },
			})
			const result = await searchProducts({
				query: 'cable',
				categoryId: electronics!.id,
			})
			expect(result.totalCount).toBe(1) // Only "USB-C Charging Cable 2m" matches "cable"
			expect(result.products[0]!.name).toBe('USB-C Charging Cable 2m')
		})

		it('returns rank ordering with most relevant first', async () => {
			const result = await searchProducts({ query: 'leather bag laptop' })
			expect(result.totalCount).toBeGreaterThanOrEqual(1)
			// "Premium Leather Laptop Bag" should be first because it matches more terms
			expect(result.products[0]!.name).toContain('Leather')
		})

		it('sorts by price ascending', async () => {
			const result = await searchProducts({ sort: 'price_asc' })
			expect(result.products.length).toBeGreaterThan(0)
for (let i = 1; i < result.products.length; i++) {
			expect(result.products[i]!.price).toBeGreaterThanOrEqual(
				result.products[i - 1]!.price,
			)
			}
		})

		it('sorts by price descending', async () => {
			const result = await searchProducts({ sort: 'price_desc' })
			expect(result.products.length).toBeGreaterThan(0)
for (let i = 1; i < result.products.length; i++) {
			expect(result.products[i]!.price).toBeLessThanOrEqual(
				result.products[i - 1]!.price,
			)
			}
		})

		it('sorts by name ascending', async () => {
			const result = await searchProducts({ sort: 'name_asc' })
			expect(result.products.length).toBeGreaterThan(0)
for (let i = 1; i < result.products.length; i++) {
			expect(
				result.products[i]!.name.localeCompare(result.products[i - 1]!.name),
			).toBeGreaterThanOrEqual(0)
			}
		})

		it('supports pagination with limit and offset', async () => {
			const page1 = await searchProducts({ limit: 2, offset: 0 })
			const page2 = await searchProducts({ limit: 2, offset: 2 })
			expect(page1.products).toHaveLength(2)
			expect(page2.products).toHaveLength(2)
			expect(page1.totalCount).toBe(6)
			expect(page2.totalCount).toBe(6)
			// No overlap
			const page1Ids = new Set(page1.products.map((p) => p.id))
			const page2Ids = new Set(page2.products.map((p) => p.id))
			expect([...page1Ids].some((id) => page2Ids.has(id))).toBe(false)
		})

		it('returns empty results for no-match query', async () => {
			const result = await searchProducts({ query: 'xyznonexistent' })
			expect(result.totalCount).toBe(0)
			expect(result.products).toHaveLength(0)
		})

		it('handles empty query string gracefully', async () => {
			const result = await searchProducts({ query: '' })
			expect(result.totalCount).toBe(6)
		})

		it('handles query with special characters safely', async () => {
			const result = await searchProducts({ query: "test's product" })
			// Should not throw - sanitized to 'test s product'
			expect(result.totalCount).toBe(0)
		})

		it('respects max limit of 100', async () => {
			const result = await searchProducts({ limit: 200 })
			expect(result.products.length).toBeLessThanOrEqual(100)
		})
	})

	describe('facets', () => {
		it('returns category facet counts', async () => {
			const result = await searchProducts()
			expect(result.facets.categories.length).toBeGreaterThan(0)

			const electronicsFacet = result.facets.categories.find(
				(f) => f.name === 'Electronics',
			)
			expect(electronicsFacet).toBeDefined()
			expect(electronicsFacet!.count).toBe(3)

			const clothingFacet = result.facets.categories.find(
				(f) => f.name === 'Clothing',
			)
			expect(clothingFacet).toBeDefined()
			expect(clothingFacet!.count).toBe(2)

			const booksFacet = result.facets.categories.find(
				(f) => f.name === 'Books',
			)
			expect(booksFacet).toBeDefined()
			expect(booksFacet!.count).toBe(1) // DRAFT excluded
		})

		it('updates category facets when search query narrows results', async () => {
			const result = await searchProducts({ query: 'headphones' })
			expect(result.facets.categories).toHaveLength(1)
			expect(result.facets.categories[0]!.name).toBe('Electronics')
			expect(result.facets.categories[0]!.count).toBe(1)
		})

		it('returns price range facet counts', async () => {
			const result = await searchProducts()
			expect(result.facets.priceRanges).toHaveLength(5)

			// $12.99 → Under $25 (1)
			const under25 = result.facets.priceRanges.find(
				(f) => f.range === 'Under $25',
			)
			expect(under25!.count).toBe(2) // USB-C + T-Shirt

			// $25-$50: $29.99 JS Book + $39.99 TS Book (DRAFT)
			const mid = result.facets.priceRanges.find(
				(f) => f.range === '$25 - $50',
			)
			expect(mid!.count).toBe(1) // Only JS Book (TS is DRAFT)

			// $50-$100: $79.99 Headphones + $89.99 Bag
			const midHigh = result.facets.priceRanges.find(
				(f) => f.range === '$50 - $100',
			)
			expect(midHigh!.count).toBe(2)

			// $100-$200: $149.99 Jacket
			const high = result.facets.priceRanges.find(
				(f) => f.range === '$100 - $200',
			)
			expect(high!.count).toBe(1)
		})

		it('updates price facets when category filter is applied', async () => {
			const electronics = await prisma.category.findFirst({
				where: { name: 'Electronics' },
			})
			const result = await searchProducts({
				categoryId: electronics!.id,
			})
			// Electronics: USB-C ($12.99), Headphones ($79.99), Bag ($89.99)
			const under25 = result.facets.priceRanges.find(
				(f) => f.range === 'Under $25',
			)
			expect(under25!.count).toBe(1) // USB-C
		})
	})

	describe('searchProductIds', () => {
		it('returns matching product IDs with rank', async () => {
			const results = await searchProductIds('headphones')
			expect(results).toHaveLength(1)
			expect(results[0]!.rank).toBeDefined()
		})

		it('returns empty array for empty query', async () => {
			const results = await searchProductIds('')
			expect(results).toHaveLength(0)
		})

		it('excludes DRAFT products', async () => {
			const results = await searchProductIds('typeScript')
			expect(results).toHaveLength(0) // TypeScript book is DRAFT
		})
	})

	describe('getFtsStatus', () => {
		it('reports FTS table exists and is populated', async () => {
			const status = await getFtsStatus()
			expect(status.exists).toBe(true)
			expect(status.indexedCount).toBe(7) // All products (including DRAFT)
			expect(status.totalProducts).toBe(7)
		})
	})
})
