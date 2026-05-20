import { describe, it, expect } from 'vitest'
import { parseSearchParams, serializeSearchParams } from './search-params.ts'

describe('search-params', () => {
	describe('parseSearchParams', () => {
		it('parses empty request as empty filters', () => {
			const request = new Request('http://localhost/shop/products')
			const filters = parseSearchParams(request)
			expect(filters.query).toBeUndefined()
			expect(filters.categoryId).toBeUndefined()
			expect(filters.minPriceCents).toBeUndefined()
			expect(filters.maxPriceCents).toBeUndefined()
			expect(filters.sort).toBeUndefined()
			expect(filters.status).toBeUndefined()
		})

		it('parses query param', () => {
			const request = new Request(
				'http://localhost/shop/products?q=headphones',
			)
			const filters = parseSearchParams(request)
			expect(filters.query).toBe('headphones')
		})

		it('parses category filter', () => {
			const request = new Request(
				'http://localhost/shop/products?category=cat123',
			)
			const filters = parseSearchParams(request)
			expect(filters.categoryId).toBe('cat123')
		})

		it('parses price range filters', () => {
			const request = new Request(
				'http://localhost/shop/products?minPrice=1000&maxPrice=5000',
			)
			const filters = parseSearchParams(request)
			expect(filters.minPriceCents).toBe(1000)
			expect(filters.maxPriceCents).toBe(5000)
		})

		it('parses sort param', () => {
			const request = new Request(
				'http://localhost/shop/products?sort=price_asc',
			)
			const filters = parseSearchParams(request)
			expect(filters.sort).toBe('price_asc')
		})

		it('ignores invalid sort values', () => {
			const request = new Request(
				'http://localhost/shop/products?sort=invalid_sort',
			)
			const filters = parseSearchParams(request)
			expect(filters.sort).toBeUndefined()
		})

		it('parses status filter', () => {
			const request = new Request(
				'http://localhost/shop/products?status=DRAFT',
			)
			const filters = parseSearchParams(request)
			expect(filters.status).toBe('DRAFT')
		})

		it('parses all filters combined', () => {
			const request = new Request(
				'http://localhost/shop/products?q=test&category=cat1&minPrice=1000&maxPrice=9999&sort=name_asc&status=DRAFT&limit=10&offset=20',
			)
			const filters = parseSearchParams(request)
			expect(filters.query).toBe('test')
			expect(filters.categoryId).toBe('cat1')
			expect(filters.minPriceCents).toBe(1000)
			expect(filters.maxPriceCents).toBe(9999)
			expect(filters.sort).toBe('name_asc')
			expect(filters.status).toBe('DRAFT')
			expect(filters.limit).toBe(10)
			expect(filters.offset).toBe(20)
		})
	})

	describe('serializeSearchParams', () => {
		it('returns empty params for empty filters', () => {
			const params = serializeSearchParams({})
			expect(params.toString()).toBe('')
		})

		it('serializes query param', () => {
			const params = serializeSearchParams({ query: 'headphones' })
			expect(params.get('q')).toBe('headphones')
		})

		it('serializes category filter', () => {
			const params = serializeSearchParams({ categoryId: 'cat123' })
			expect(params.get('category')).toBe('cat123')
		})

		it('serializes price range', () => {
			const params = serializeSearchParams({
				minPriceCents: 1000,
				maxPriceCents: 5000,
			})
			expect(params.get('minPrice')).toBe('1000')
			expect(params.get('maxPrice')).toBe('5000')
		})

		it('serializes sort param', () => {
			const params = serializeSearchParams({ sort: 'price_desc' })
			expect(params.get('sort')).toBe('price_desc')
		})

		it('omits default sort (relevance)', () => {
			const params = serializeSearchParams({ sort: 'relevance' })
			expect(params.get('sort')).toBeNull()
		})

		it('serializes status when not ACTIVE', () => {
			const params = serializeSearchParams({ status: 'DRAFT' })
			expect(params.get('status')).toBe('DRAFT')
		})

		it('omits default status (ACTIVE)', () => {
			const params = serializeSearchParams({ status: 'ACTIVE' })
			expect(params.get('status')).toBeNull()
		})
	})
})
