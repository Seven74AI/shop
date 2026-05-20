import { Link } from 'react-router'
import { JsonLd } from '#app/components/json-ld.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { makeOrganizationJsonLd, makeWebSiteJsonLd } from '#app/utils/json-ld.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const categories = await prisma.category.findMany({
		where: {
			parentId: null, // Only get root categories
		},
		include: {
			_count: {
				select: {
					products: true,
				},
			},
		},
		orderBy: {
			name: 'asc',
		},
	})

	return { categories, siteUrl: getDomainUrl(request) }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Shop | Epic Shop' },
	{ name: 'description', content: 'Browse our product catalog' },
]

export default function Index({ loaderData }: Route.ComponentProps) {
	const { categories, siteUrl } = loaderData

	const jsonLd = [
		makeOrganizationJsonLd({
			name: 'Epic Shop',
			url: siteUrl,
			description: 'Discover our amazing selection of products.',
		}),
		makeWebSiteJsonLd({
			name: 'Epic Shop',
			url: siteUrl,
			description: 'Discover our amazing selection of products.',
		}),
	]

	return (
		<div className="container py-8">
			<JsonLd data={jsonLd} />
			<div className="space-y-12 animate-slide-top">
			{/* Hero Section */}
			<div className="text-center space-y-4">
				<h1 className="text-4xl font-bold tracking-tight">Welcome to our Shop</h1>
				<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
					Discover our amazing selection of products. Browse by category or explore our full catalog.
				</p>
				<div className="pt-4">
					<Link to="/shop/products" className="btn-primary">
						Browse All Products
					</Link>
				</div>
			</div>

			{/* Categories Grid */}
			<div>
				<h2 className="text-2xl font-semibold mb-6">Shop by Category</h2>
				{categories.length === 0 ? (
					<div className="text-center py-12">
						<p className="text-muted-foreground">No categories available yet.</p>
					</div>
				) : (
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{categories.map((category: typeof categories[0]) => (
							<Link
								key={category.id}
								to={`/shop/categories/${category.slug}`}
								className="block p-6 border rounded-lg hover:shadow-md transition-shadow duration-200"
								data-testid="category-card"
							>
								<h3 className="text-xl font-semibold mb-2">{category.name}</h3>
								{category.description && (
									<p className="text-sm text-muted-foreground mb-3 line-clamp-2">
										{category.description}
									</p>
								)}
								<p className="text-sm font-medium text-primary">
									{category._count.products} {category._count.products === 1 ? 'product' : 'products'}
								</p>
							</Link>
						))}
					</div>
				)}
			</div>
		</div>
		</div>
	)
}