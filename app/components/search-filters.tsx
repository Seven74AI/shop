import { useId } from 'react'
import { Form } from 'react-router'
import { type SearchFacets } from '#app/utils/product-search.server.ts'
import { Checkbox } from './ui/checkbox.tsx'
import { Label } from './ui/label.tsx'

interface SearchFiltersProps {
	facets: SearchFacets
	/** Currently active filter values from URL */
	activeQuery: string
	activeCategoryId: string
	activeMinPrice?: number
	activeMaxPrice?: number
	activeSort?: string
}

/**
 * Hidden inputs that preserve all active filter params inside a GET Form.
 * Passed to every search filter form so toggling one filter doesn't drop the others.
 */
function HiddenFilterParams({
	query,
	categoryId,
	minPrice,
	maxPrice,
	sort,
}: {
	query?: string
	categoryId?: string
	minPrice?: number
	maxPrice?: number
	sort?: string
}) {
	return (
		<>
			{query && (
				<input type="hidden" name="q" value={query} />
			)}
			{categoryId && (
				<input type="hidden" name="category" value={categoryId} />
			)}
			{minPrice !== undefined && (
				<input type="hidden" name="minPrice" value={minPrice} />
			)}
			{maxPrice !== undefined && (
				<input type="hidden" name="maxPrice" value={maxPrice} />
			)}
			{sort && sort !== 'relevance' && (
				<input type="hidden" name="sort" value={sort} />
			)}
		</>
	)
}

/**
 * Filter sidebar component for the product search page.
 * Uses <Form method="GET"> so filter changes update the URL
 * and trigger server-side search via the loader.
 */
export function SearchFilters({
	facets,
	activeQuery,
	activeCategoryId,
	activeMinPrice,
	activeMaxPrice,
	activeSort,
}: SearchFiltersProps) {
	const id = useId()

	return (
		<aside className="space-y-6" data-testid="search-filters">
			{/* Category Filters */}
			{facets.categories.length > 0 && (
				<fieldset>
					<legend className="text-sm font-semibold mb-3">
						Categories
					</legend>
					<div className="space-y-2">
						<Form method="GET" action="/shop/products">
							<HiddenFilterParams
								query={activeQuery}
								minPrice={activeMinPrice}
								maxPrice={activeMaxPrice}
								sort={activeSort}
							/>
							<FilterCheckbox
								id={`${id}-cat-all`}
								name="category"
								value=""
								label="All Categories"
								checked={!activeCategoryId}
							/>
						</Form>
						{facets.categories.map((cat) => (
							<Form
								key={cat.id}
								method="GET"
								action="/shop/products"
							>
								<HiddenFilterParams
									query={activeQuery}
									minPrice={activeMinPrice}
									maxPrice={activeMaxPrice}
									sort={activeSort}
								/>
								<FilterCheckbox
									id={`${id}-cat-${cat.id}`}
									name="category"
									value={cat.id}
									label={`${cat.name} (${cat.count})`}
									checked={activeCategoryId === cat.id}
								/>
							</Form>
						))}
					</div>
				</fieldset>
			)}

			{/* Price Range Filters */}
			{facets.priceRanges.length > 0 && (
				<fieldset>
					<legend className="text-sm font-semibold mb-3">
						Price Range
					</legend>
					<div className="space-y-2">
						<Form method="GET" action="/shop/products">
							<HiddenFilterParams
								query={activeQuery}
								categoryId={activeCategoryId}
								sort={activeSort}
							/>
							<FilterCheckbox
								id={`${id}-price-all`}
								label="All Prices"
								checked={
									activeMinPrice === undefined &&
									activeMaxPrice === undefined
								}
							/>
						</Form>
						{facets.priceRanges.map((pr) => (
							<Form
								key={pr.range}
								method="GET"
								action="/shop/products"
							>
								<HiddenFilterParams
									query={activeQuery}
									categoryId={activeCategoryId}
									sort={activeSort}
								/>
								{pr.min !== null && (
									<input
										type="hidden"
										name="minPrice"
										value={pr.min}
									/>
								)}
								{pr.max !== null && (
									<input
										type="hidden"
										name="maxPrice"
										value={pr.max}
									/>
								)}
								<FilterCheckbox
									id={`${id}-price-${pr.range}`}
									label={`${pr.range} (${pr.count})`}
									checked={
										activeMinPrice === pr.min &&
										activeMaxPrice === pr.max
									}
								/>
							</Form>
						))}
					</div>
				</fieldset>
			)}
		</aside>
	)
}

/**
 * Filter checkbox that submits its parent form on change.
 * Uses a native hidden checkbox input alongside the Radix UI checkbox
 * so the value participates in form submission.
 */
function FilterCheckbox({
	id,
	name,
	value,
	label,
	checked,
}: {
	id: string
	name?: string
	value?: string
	label: string
	checked: boolean
}) {
	return (
		<div className="flex items-center gap-2">
			{/* Native hidden checkbox: participates in form submission.
			    unchecked = not sent. checked = sent with name+value. */}
			{name && value && (
				<input
					id={`${id}-native`}
					type="checkbox"
					name={name}
					value={value}
					defaultChecked={checked}
					className="hidden"
					aria-hidden="true"
					tabIndex={-1}
				/>
			)}
			<Checkbox
				id={id}
				name={undefined}
				checked={checked}
				onCheckedChange={() => {
					// Click the native checkbox to toggle it, then submit the form
					const native = document.getElementById(
						`${id}-native`,
					) as HTMLInputElement | null
					if (native) {
						native.checked = !native.checked
					}
					const form = document.getElementById(id)?.closest('form')
					if (form instanceof HTMLFormElement) {
						form.submit()
					}
				}}
			/>
			<Label htmlFor={id} className="text-sm cursor-pointer">
				{label}
			</Label>
		</div>
	)
}
