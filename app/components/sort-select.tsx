import { useRef } from 'react'
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
	const formRef = useRef<HTMLFormElement>(null)
	const sortInputRef = useRef<HTMLInputElement>(null)

	const activeValue = SORT_OPTIONS.some((o) => o.value === activeSort)
		? activeSort
		: 'relevance'

	return (
		<Form
			ref={formRef}
			method="GET"
			action="/shop/products"
			data-testid="sort-form"
		>
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
			<input ref={sortInputRef} type="hidden" name="sort" value={activeValue} />
			<Select
				name="sort"
				value={activeValue}
				onValueChange={(value) => {
					// Update hidden input before submitting the form
					if (sortInputRef.current) sortInputRef.current.value = value
					formRef.current?.requestSubmit()
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
