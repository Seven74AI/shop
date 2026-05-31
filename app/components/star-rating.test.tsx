/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StarRating, StarRatingCompact } from './star-rating.tsx'

// ─── Shared test data ──────────────────────────────────────────────────────

const distribution: [number, number, number, number, number] = [
	2, 1, 4, 3, 6,
] // 1★:2, 2★:1, 3★:4, 4★:3, 5★:6 → avg = (2+2+12+12+30)/16 = 58/16 = 3.625
const totalCount = 16
const averageRating = 58 / 16 // 3.625

const emptyDistribution: [number, number, number, number, number] = [
	0, 0, 0, 0, 0,
]

// ─── StarRating (full with distribution) ───────────────────────────────────

describe('StarRating', () => {
	it('renders average rating, review count, and distribution chart', () => {
		render(
			<StarRating
				averageRating={averageRating}
				distribution={distribution}
				totalCount={totalCount}
				showDistribution
			/>,
		)

		// Should show the numeric rating
		expect(screen.getByText('3.6')).toBeDefined()

		// Should show the review count
		expect(screen.getByText('(16 reviews)')).toBeDefined()

		// Should have a distribution chart with aria-label
		expect(
			screen.getByLabelText('reviews.ratingDistribution'),
		).toBeDefined()
	})

	it('renders simple view without distribution when showDistribution=false', () => {
		render(
			<StarRating
				averageRating={averageRating}
				totalCount={totalCount}
				showDistribution={false}
			/>,
		)

		// Should show count in compact form
		expect(screen.getByText('(16)')).toBeDefined()

		// Should NOT have distribution chart
		expect(
			screen.queryByLabelText('reviews.ratingDistribution'),
		).toBeNull()
	})

	it('renders stars only when no totalCount', () => {
		render(
			<StarRating
				averageRating={null}
				totalCount={0}
			/>,
		)

		// Should NOT show count when totalCount is 0
		expect(screen.queryByText(/\(\d+\)/)).toBeNull()
	})

	it('renders average with one decimal place for .625', () => {
		render(
			<StarRating
				averageRating={averageRating}
				distribution={distribution}
				totalCount={totalCount}
				showDistribution
			/>,
		)

		expect(screen.getByText('3.6')).toBeDefined()
	})

	it('renders singular "review" for count of 1', () => {
		render(
			<StarRating
				averageRating={4}
				distribution={[0, 0, 0, 1, 0]}
				totalCount={1}
				showDistribution
			/>,
		)

		expect(screen.getByText('(1 review)')).toBeDefined()
	})
})

// ─── StarRatingCompact ─────────────────────────────────────────────────────

describe('StarRatingCompact', () => {
	it('renders compact rating with count', () => {
		render(
			<StarRatingCompact
				averageRating={4.5}
				totalCount={42}
			/>,
		)

		expect(screen.getByText('4.5 (42)')).toBeDefined()
	})

	it('renders "No reviews" when averageRating is null', () => {
		render(
			<StarRatingCompact
				averageRating={null}
				totalCount={0}
			/>,
		)

		expect(screen.getByText('reviews.noReviews')).toBeDefined()
	})

	it('renders "No reviews" when totalCount is 0', () => {
		render(
			<StarRatingCompact
				averageRating={4.0}
				totalCount={0}
			/>,
		)

		expect(screen.getByText('reviews.noReviews')).toBeDefined()
	})
})
