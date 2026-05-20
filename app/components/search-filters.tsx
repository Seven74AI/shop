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
							{activeQuery && (
								<input
									type="hidden"
									name="q"
									value={activeQuery}
								/>
							)}
							<FilterCheckbox
								id={`${id}-cat-all`}
								name="category"
								value=""
								label="All Categories"
								checked={!activeCategoryId}
								formAction="/shop/products"
							/>
						</Form>
						{facets.categories.map((cat) => (
							<Form
								key={cat.id}
								method="GET"
								action="/shop/products"
							>
								{activeQuery && (
									<input
										type="hidden"
										name="q"
										value={activeQuery}
									/>
								)}
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
							{activeQuery && (
								<input
									type="hidden"
									name="q"
									value={activeQuery}
								/>
							)}
							{activeCategoryId && (
								<input
									type="hidden"
									name="category"
									value={activeCategoryId}
								/>
							)}
							<FilterCheckbox
								id={`${id}-price-all`}
								label="All Prices"
								checked={
									activeMinPrice === undefined &&
									activeMaxPrice === undefined
								}
								formAction="/shop/products"
							/>
						</Form>
						{facets.priceRanges.map((pr) => (
							<Form
								key={pr.range}
								method="GET"
								action="/shop/products"
							>
								{activeQuery && (
									<input
										type="hidden"
										name="q"
										value={activeQuery}
									/>
								)}
								{activeCategoryId && (
									<input
										type="hidden"
										name="category"
										value={activeCategoryId}
									/>
								)}
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

function FilterCheckbox({
	id,
	name,
	value,
	label,
	checked,
	formAction,
}: {
	id: string
	name?: string
	value?: string
	label: string
	checked: boolean
	formAction?: string
}) {
	return (
		<div className="flex items-center gap-2">
			<Checkbox
				id={id}
				name={name}
				value={value}
				formAction={formAction}
				checked={checked}
				onCheckedChange={() => {
					// Submit the parent form on checkbox change
					const form = document.getElementById(id)?.closest('form')
					if (form instanceof HTMLFormElement) {
						form.requestSubmit()
					}
				}}
			/>
			<Label htmlFor={id} className="text-sm cursor-pointer">
				{label}
			</Label>
		</div>
	)
}
