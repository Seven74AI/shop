/**
 * Star rating components for product reviews.
 * Inline SVG stars with partial fill, distribution bar chart.
 */

import { useTranslation } from '#app/utils/i18n.tsx'

let globalCounter = 0

// ─── Public Components ───────────────────────────────────────────────────

export function StarRating({
	averageRating,
	distribution,
	totalCount,
	showDistribution = false,
	size = 'md',
}: {
	averageRating: number | null
	distribution?: [number, number, number, number, number]
	totalCount?: number
	showDistribution?: boolean
	size?: 'sm' | 'md' | 'lg'
}) {
	if (!showDistribution || !distribution || !totalCount) {
		return (
			<div className="flex items-center gap-1">
				<StarsRow rating={averageRating} size={size} />
				{totalCount != null && totalCount > 0 && (
					<span className="text-muted-foreground text-sm ml-1">
						({totalCount})
					</span>
				)}
			</div>
		)
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-1">
				<StarsRow rating={averageRating} size={size} />
				{averageRating != null && (
					<span className="font-medium text-sm ml-1">
						{averageRating.toFixed(1)}
					</span>
				)}
				<span className="text-muted-foreground text-sm ml-1">
					({totalCount} review{totalCount !== 1 ? 's' : ''})
				</span>
			</div>
			<RatingDistribution distribution={distribution} totalCount={totalCount} />
		</div>
	)
}

export function StarRatingCompact({
	averageRating,
	totalCount,
}: {
	averageRating: number | null
	totalCount?: number
}) {
	const { t } = useTranslation()
	if (averageRating == null || totalCount == null || totalCount === 0) {
		return <span className="text-muted-foreground text-xs">{t('reviews.noReviews')}</span>
	}

	return (
		<div className="flex items-center gap-1">
			<StarsRow rating={averageRating} size="sm" />
			<span className="text-muted-foreground text-xs">
				{averageRating.toFixed(1)} ({totalCount})
			</span>
		</div>
	)
}

// ─── StarsRow ────────────────────────────────────────────────────────────

function StarsRow({
	rating,
	size,
}: {
	rating: number | null
	size: 'sm' | 'md' | 'lg'
}) {
	const dims = { sm: 14, md: 18, lg: 24 }[size]

	if (rating == null || rating === 0) {
		return (
			<>
				{[...Array(5)].map((_, i) => (
					<StarSvg key={i} fill="none" size={dims} opacity={0.3} />
				))}
			</>
		)
	}

	const fullStars = Math.floor(rating)
	const fraction = rating - fullStars

	return (
		<>
			{[...Array(fullStars)].map((_, i) => (
				<StarSvg key={`f-${i}`} fill="currentColor" size={dims} />
			))}
			{fraction > 0 && (
				<PartialStar fraction={fraction} size={dims} />
			)}
			{[...Array(Math.max(0, 5 - fullStars - (fraction > 0 ? 1 : 0)))].map((_, i) => (
				<StarSvg key={`e-${i}`} fill="none" size={dims} opacity={0.3} />
			))}
		</>
	)
}

// ─── Partial Star (clipPath approach, no ID clash) ───────────────────────

function PartialStar({ fraction, size }: { fraction: number; size: number }) {
	const id = `star-clip-${++globalCounter}`
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			className="text-yellow-500 inline-block shrink-0"
			aria-hidden="true"
		>
			<defs>
				<clipPath id={id}>
					<rect x="0" y="0" width={fraction * 24} height="24" />
				</clipPath>
			</defs>
			{/* Empty star background */}
			<path
				d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				opacity={0.3}
			/>
			{/* Filled portion clipped */}
			<g clipPath={`url(#${id})`}>
				<path
					d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
					fill="currentColor"
					stroke="currentColor"
					strokeWidth={1.5}
				/>
			</g>
		</svg>
	)
}

// ─── Star SVG ────────────────────────────────────────────────────────────

function StarSvg({
	fill = 'none',
	size = 18,
	opacity = 1,
}: {
	fill?: string
	size?: number
	opacity?: number
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={fill}
			stroke="currentColor"
			strokeWidth={1.5}
			className="text-yellow-500 inline-block shrink-0"
			style={{ opacity }}
			aria-hidden="true"
		>
			<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
		</svg>
	)
}

// ─── Distribution Bar Chart ──────────────────────────────────────────────

function RatingDistribution({
	distribution,
	totalCount,
}: {
	distribution: [number, number, number, number, number]
	totalCount: number
}) {
	const { t } = useTranslation()
	return (
		<div className="space-y-1 text-sm" aria-label={t('reviews.ratingDistribution')}>
			{[5, 4, 3, 2, 1].map((star) => {
				const count = distribution[star - 1] ?? 0
				const pct = totalCount > 0 ? (count / totalCount) * 100 : 0
				return (
					<div key={star} className="flex items-center gap-2">
						<span className="w-3 text-right text-muted-foreground">{star}</span>
						<StarSvg size={12} fill="currentColor" opacity={0.8} />
						<div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
							<div
								className="h-full bg-yellow-500 rounded-full transition-all"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<span className="w-6 text-right text-muted-foreground text-xs">
							{count}
						</span>
					</div>
				)
			})}
		</div>
	)
}
