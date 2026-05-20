import { prisma } from './db.server.ts'

// ─── Types ───────────────────────────────────────────────────────────────

export interface SearchFilters {
	/** Full-text search query string */
	query?: string
	/** Filter by category ID */
	categoryId?: string
	/** Minimum price in cents (inclusive) */
	minPriceCents?: number
	/** Maximum price in cents (inclusive) */
	maxPriceCents?: number
	/** Filter by product status (default: only ACTIVE for public search) */
	status?: string
	/** Sort order */
	sort?: 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc'
	/** Maximum results per page */
	limit?: number
	/** Offset for pagination */
	offset?: number
}

export interface SearchProduct {
	id: string
	name: string
	slug: string
	description: string | null
	price: number
	status: string
	categoryId: string
	weightGrams: number | null
	/** FTS5 relevance rank (lower = more relevant) */
	rank: number
}

export interface CategoryFacet {
	id: string
	name: string
	count: number
}

export interface PriceRangeFacet {
	range: string
	min: number | null
	max: number | null
	count: number
}

export interface SearchFacets {
	categories: CategoryFacet[]
	priceRanges: PriceRangeFacet[]
}

export interface SearchResult {
	products: SearchProduct[]
	totalCount: number
	facets: SearchFacets
}

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/** Price ranges for faceted filtering (in cents) */
const PRICE_RANGES: Array<{ range: string; min: number | null; max: number | null }> = [
	{ range: 'Under $25', min: null, max: 2499 },
	{ range: '$25 - $50', min: 2500, max: 4999 },
	{ range: '$50 - $100', min: 5000, max: 9999 },
	{ range: '$100 - $200', min: 10000, max: 19999 },
	{ range: '$200+', min: 20000, max: null },
]

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Build the WHERE clause for FTS5 query + facet filters.
 * Uses a CTE approach: first get matching FTS5 rowids + rank,
 * then join with Product for additional filtering.
 */
function buildSearchQuery(filters: SearchFilters): {
	sql: string
	params: (string | number)[]
} {
	const conditions: string[] = []
	const params: (string | number)[] = []

	// FTS5 match
	if (filters.query && filters.query.trim()) {
		// Escape FTS5 special characters and build prefix query for partial matching
		const sanitized = filters.query
			.trim()
			.replace(/['"]/g, '')
			.replace(/\s+/g, ' ')
		if (sanitized) {
			// Split into tokens and append * for prefix matching
			const tokens = sanitized.split(/\s+/).filter(Boolean)
			const ftsQuery = tokens.map((t) => `"${t}"*`).join(' ')
			conditions.push(`pf.product_fts MATCH ?`)
			params.push(ftsQuery)
		}
	}

	// Build the base query - always join to get rank if FTS match, otherwise direct Product query
	const hasQuery = conditions.length > 0

	let sql: string

	if (hasQuery) {
		// FTS5 search with rank
		sql = `
			WITH fts_match AS (
				SELECT rowid, rank
				FROM product_fts
				WHERE ${conditions.join(' AND ')}
				ORDER BY rank
			)
			SELECT
				p.id, p.name, p.slug, p.description,
				p.price, p.status, p.categoryId, p.weightGrams,
				fm.rank
			FROM fts_match fm
			JOIN Product p ON p.rowid = fm.rowid
		`
	} else {
		// No FTS query - direct Product query
		sql = `
			SELECT
				p.id, p.name, p.slug, p.description,
				p.price, p.status, p.categoryId, p.weightGrams,
				0 as rank
			FROM Product p
		`
	}

	// Additional filters (applied after FTS or directly)
	const filterConditions: string[] = []

	if (filters.categoryId) {
		filterConditions.push(`p.categoryId = ?`)
		params.push(filters.categoryId)
	}

	if (filters.minPriceCents !== undefined) {
		filterConditions.push(`p.price >= ?`)
		params.push(filters.minPriceCents)
	}

	if (filters.maxPriceCents !== undefined) {
		filterConditions.push(`p.price <= ?`)
		params.push(filters.maxPriceCents)
	}

	if (filters.status) {
		filterConditions.push(`p.status = ?`)
		params.push(filters.status)
	} else {
		// Default: only show ACTIVE products in public search
		filterConditions.push(`p.status = 'ACTIVE'`)
	}

	if (filterConditions.length > 0) {
		sql += ` WHERE ${filterConditions.join(' AND ')}`
	}

	return { sql, params }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Search products using FTS5 full-text search with optional faceted filters.
 * Returns paginated results with relevance ranking and facet counts.
 */
export async function searchProducts(
	filters: SearchFilters = {},
): Promise<SearchResult> {
	const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
	const offset = filters.offset ?? 0

	const { sql: baseSql, params } = buildSearchQuery(filters)

	// Count total matching products
	const countSql = `SELECT COUNT(*) as cnt FROM (${baseSql})`
	const countResult = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(countSql, ...params)
	const totalCount = Number(countResult[0]?.cnt ?? 0)

	// Add sort and pagination
	let sortedSql = baseSql
	switch (filters.sort) {
		case 'price_asc':
			sortedSql += ` ORDER BY p.price ASC`
			break
		case 'price_desc':
			sortedSql += ` ORDER BY p.price DESC`
			break
		case 'name_asc':
			sortedSql += ` ORDER BY p.name ASC`
			break
		case 'name_desc':
			sortedSql += ` ORDER BY p.name DESC`
			break
		case 'relevance':
		default:
			// If no FTS query, sort by name
			if (!filters.query?.trim()) {
				sortedSql += ` ORDER BY p.name ASC`
			} else {
				sortedSql += ` ORDER BY rank`
			}
			break
	}

	sortedSql += ` LIMIT ? OFFSET ?`
	const productParams = [...params, limit, offset]

	const products = await prisma.$queryRawUnsafe<SearchProduct[]>(sortedSql, ...productParams)

	// Get facets
	const facets = await getFacets(baseSql, params)

	return { products, totalCount, facets }
}

/**
 * Compute facet counts for a given search result set.
 * Returns category counts and price range counts.
 */
async function getFacets(
	baseSql: string,
	params: (string | number)[],
): Promise<SearchFacets> {
	// Category facet counts
	const categorySql = `
		SELECT p.categoryId as id, c.name, COUNT(*) as count
		FROM (${baseSql}) p
		JOIN Category c ON c.id = p.categoryId
		GROUP BY p.categoryId
		ORDER BY count DESC
	`
	const categoryFacets = await prisma.$queryRawUnsafe<CategoryFacet[]>(
		categorySql,
		...params,
	)

	// Price range facet counts
	const priceRangeFacets: PriceRangeFacet[] = []
	for (const pr of PRICE_RANGES) {
		const priceConditions: string[] = []
		const priceParams: (string | number)[] = [...params]

		if (pr.min !== null) {
			priceConditions.push(`p.price >= ?`)
			priceParams.push(pr.min)
		}
		if (pr.max !== null) {
			priceConditions.push(`p.price <= ?`)
			priceParams.push(pr.max)
		}

		if (priceConditions.length === 0) continue

		const priceSql = `
			SELECT COUNT(*) as count
			FROM (${baseSql}) p
			WHERE ${priceConditions.join(' AND ')}
		`
		const result = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
			priceSql,
			...priceParams,
		)
		priceRangeFacets.push({
			range: pr.range,
			min: pr.min,
			max: pr.max,
			count: Number(result[0]?.count ?? 0),
		})
	}

	return { categories: categoryFacets, priceRanges: priceRangeFacets }
}

/**
 * Simple product search returning only product IDs with rank.
 * Useful for lightweight search without full product data.
 */
export async function searchProductIds(
	query: string,
	limit = DEFAULT_LIMIT,
): Promise<Array<{ id: string; rank: number }>> {
	if (!query.trim()) return []

	const sanitized = query.trim().replace(/['"]/g, '').replace(/\s+/g, ' ')
	const tokens = sanitized.split(/\s+/).filter(Boolean)
	if (tokens.length === 0) return []

	const ftsQuery = tokens.map((t) => `"${t}"*`).join(' ')

	const results = await prisma.$queryRawUnsafe<
		Array<{ id: string; rank: number }>
	>(
		`SELECT p.id, fm.rank
		 FROM product_fts fm
		 JOIN Product p ON p.rowid = fm.rowid
		 WHERE product_fts MATCH ?
		   AND p.status = 'ACTIVE'
		 ORDER BY fm.rank
		 LIMIT ?`,
		ftsQuery,
		limit,
	)

	return results
}

/**
 * Check if the FTS5 table exists and is populated.
 * Returns the number of indexed products.
 */
export async function getFtsStatus(): Promise<{
	exists: boolean
	indexedCount: number
	totalProducts: number
}> {
	try {
		const ftsResult = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
			`SELECT COUNT(*) as cnt FROM product_fts`,
		)
		const indexedCount = Number(ftsResult[0]?.cnt ?? 0)

		const totalResult = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
			`SELECT COUNT(*) as cnt FROM Product`,
		)
		const totalProducts = Number(totalResult[0]?.cnt ?? 0)

		return { exists: true, indexedCount, totalProducts }
	} catch {
		return { exists: false, indexedCount: 0, totalProducts: 0 }
	}
}
