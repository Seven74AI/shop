import { type SearchFilters } from './product-search.server.ts'

const VALID_SORTS = [
	'relevance',
	'price_asc',
	'price_desc',
	'name_asc',
	'name_desc',
] as const

/**
 * Safely parse a URL search param to a number.
 * Returns undefined for null, empty string, and NaN values.
 */
function parseNumericParam(val: string | null): number | undefined {
	if (val === null || val === '') return undefined
	const n = Number(val)
	return Number.isNaN(n) ? undefined : n
}

/**
 * Parse URL search params into SearchFilters.
 * Used in loaders to convert URL state to server search parameters.
 */
export function parseSearchParams(request: Request): SearchFilters {
	const url = new URL(request.url)
	const sp = url.searchParams

	const query = sp.get('q') ?? undefined
	const categoryId = sp.get('category') ?? undefined
	const minPriceStr = sp.get('minPrice')
	const maxPriceStr = sp.get('maxPrice')
	const status = sp.get('status') ?? undefined
	const sortRaw = sp.get('sort')
	const limitStr = sp.get('limit')
	const offsetStr = sp.get('offset')

	const sort = VALID_SORTS.includes(sortRaw as (typeof VALID_SORTS)[number])
		? (sortRaw as SearchFilters['sort'])
		: undefined

	return {
		query,
		categoryId,
		minPriceCents: parseNumericParam(minPriceStr),
		maxPriceCents: parseNumericParam(maxPriceStr),
		status,
		sort,
		limit: parseNumericParam(limitStr),
		offset: parseNumericParam(offsetStr),
	}
}

/**
 * Serialize SearchFilters to URLSearchParams.
 * Only includes non-default values to keep URLs clean.
 */
export function serializeSearchParams(
	filters: Partial<SearchFilters>,
): URLSearchParams {
	const sp = new URLSearchParams()
	if (filters.query) sp.set('q', filters.query)
	if (filters.categoryId) sp.set('category', filters.categoryId)
	if (filters.minPriceCents !== undefined)
		sp.set('minPrice', String(filters.minPriceCents))
	if (filters.maxPriceCents !== undefined)
		sp.set('maxPrice', String(filters.maxPriceCents))
	if (filters.status && filters.status !== 'ACTIVE')
		sp.set('status', filters.status)
	if (filters.sort && filters.sort !== 'relevance')
		sp.set('sort', filters.sort)
	return sp
}
