import { Form, useSearchParams } from 'react-router'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select.tsx'

const SORT_OPTIONS = [
	{ value: 'relevance', label: 'Relevance' },
	{ value: 'price_asc', label: 'Price: Low to High' },
	{ value: 'price_desc', label: 'Price: High to Low' },
	{ value: 'name_asc', label: 'Name: A to Z' },
	{ value: 'name_desc', label: 'Name: Z to A' },
] as const

interface SortSelectProps {
	activeSort: string
}

/**
 * Sort dropdown that submits via GET form to update URL params.
 * Preserves existing search and filter params.
 */
export function SortSelect({ activeSort }: SortSelectProps) {
	const [searchParams] = useSearchParams()

	const activeValue = SORT_OPTIONS.some((o) => o.value === activeSort)
		? activeSort
		: 'relevance'

	return (
		<Form method="GET" action="/shop/products" data-testid="sort-form">
			{/* Preserve existing search and filter params */}
			{['q', 'category', 'minPrice', 'maxPrice', 'status'].map(
				(param) => {
					const val = searchParams.get(param)
					return val ? (
						<input
							key={param}
							type="hidden"
							name={param}
							value={val}
						/>
					) : null
				},
			)}
			<Select
				name="sort"
				value={activeValue}
				onValueChange={(value) => {
					// Submit the form when sort changes
					const form = document.querySelector<HTMLFormElement>(
						'[data-testid="sort-form"]',
					)
					if (form) {
						const selectInput = form.querySelector<HTMLInputElement>(
							'input[name="sort"]',
						)
						if (selectInput) selectInput.value = value
						form.requestSubmit()
					}
				}}
			>
				<SelectTrigger
					className="w-[180px]"
					aria-label="Sort products"
				>
					<SelectValue placeholder="Sort by..." />
				</SelectTrigger>
				<SelectContent>
					{SORT_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</Form>
	)
}
