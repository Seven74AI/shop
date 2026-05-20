import { Link } from 'react-router'
import { SearchFilters } from '#app/components/search-filters.tsx'
import { SortSelect } from '#app/components/sort-select.tsx'
import { useTranslation } from '#app/utils/i18n.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { searchProducts } from '#app/utils/product-search.server.ts'
import { parseSearchParams } from '#app/utils/search-params.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const filters = parseSearchParams(request)

	const result = await searchProducts({
		...filters,
		// searchProducts defaults to ACTIVE when no status is specified
		status: filters.status,
	})

	const currency = await getStoreCurrency()

	return {
		products: result.products,
		totalCount: result.totalCount,
		facets: result.facets,
		currency,
		// Pass active filters to the UI
		activeQuery: filters.query ?? '',
		activeCategoryId: filters.categoryId ?? '',
		activeMinPrice: filters.minPriceCents,
		activeMaxPrice: filters.maxPriceCents,
		activeSort: filters.sort ?? 'relevance',
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Products | Shop | Epic Shop' },
	{ name: 'description', content: 'Browse our product catalog with search and filters' },
]

export default function ProductsIndex({
	loaderData,
}: Route.ComponentProps) {
	const { locale } = useTranslation()
	const {
		products,
		totalCount,
		facets,
		currency,
		activeQuery,
		activeCategoryId,
		activeMinPrice,
		activeMaxPrice,
		activeSort,
	} = loaderData

	return (
		<div className="container py-8">
			<div className="space-y-6 animate-slide-top">
				{/* Header */}
				<div>
					<h1 className="text-3xl font-bold tracking-tight">
						Products
					</h1>
					<p className="text-muted-foreground">
						{totalCount}{' '}
						{totalCount === 1 ? 'product' : 'products'}
						{activeQuery ? ` for "${activeQuery}"` : ''}
					</p>
				</div>

				{/* Search Bar + Sort */}
				<div className="flex flex-col sm:flex-row gap-4">
					<div className="flex-1">
						<form
							method="GET"
							action="/shop/products"
							role="search"
							className="flex gap-2"
						>
							{/* Preserve existing filters when searching */}
							{activeCategoryId && (
								<input
									type="hidden"
									name="category"
									value={activeCategoryId}
								/>
							)}
							{activeMinPrice !== undefined && (
								<input
									type="hidden"
									name="minPrice"
									value={activeMinPrice}
								/>
							)}
							{activeMaxPrice !== undefined && (
								<input
									type="hidden"
									name="maxPrice"
									value={activeMaxPrice}
								/>
							)}
							{activeSort !== 'relevance' && (
								<input
									type="hidden"
									name="sort"
									value={activeSort}
								/>
							)}
							<input
								type="search"
								name="q"
								placeholder="Search products..."
								defaultValue={activeQuery}
								className="flex-1 px-4 py-2 border rounded-md"
								aria-label="Search products"
								data-testid="product-search-input"
							/>
							<button
								type="submit"
								className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
								data-testid="product-search-submit"
							>
								Search
							</button>
						</form>
					</div>
					<SortSelect activeSort={activeSort} />
				</div>

				{/* Main content: filters + products */}
				<div className="flex flex-col md:flex-row gap-8">
					{/* Filters Sidebar */}
					<div className="w-full md:w-64 shrink-0">
						<SearchFilters
							facets={facets}
							activeQuery={activeQuery}
							activeCategoryId={activeCategoryId}
							activeMinPrice={activeMinPrice}
							activeMaxPrice={activeMaxPrice}
							activeSort={activeSort}
						/>
					</div>

					{/* Products Grid */}
					<div className="flex-1">
						{products.length === 0 ? (
							<div
								className="text-center py-12"
								data-testid="empty-results"
							>
								<p className="text-muted-foreground">
									No products found.
								</p>
							</div>
						) : (
							<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
								{products.map((product) => (
									<Link
										key={product.id}
										to={`/shop/products/${product.slug}`}
										className="block border rounded-lg overflow-hidden hover:shadow-md transition-shadow duration-200"
										data-testid="product-card"
									>
										<div className="aspect-video bg-muted flex items-center justify-center">
											<span className="text-muted-foreground">
												{product.name}
											</span>
										</div>
										<div className="p-4">
											<h2 className="font-semibold mb-1 text-lg">
												{product.name}
											</h2>
											<p className="text-sm text-muted-foreground mb-2">
												{product.categoryId}
											</p>
											<p className="text-lg font-bold">
												{formatPrice(product.price, currency, locale)}
											</p>
										</div>
									</Link>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
