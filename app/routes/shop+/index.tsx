import { Link } from 'react-router'
import { useTranslation } from '#app/utils/i18n.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/index.ts'

export async function loader() {
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

	return { categories }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Boutique | Boutique | Epic Shop' },
	{ name: 'description', content: 'Parcourir notre catalogue de produits' },
]

export default function ShopIndex({ loaderData }: Route.ComponentProps) {
	const { t } = useTranslation()
	const { categories } = loaderData

	return (
		<div className="container py-8">
			<div className="space-y-12 animate-slide-top">
			{/* Hero Section */}
			<div className="text-center space-y-4">
				<h1 className="text-4xl font-bold tracking-tight">{t('marketing.hero.title')}</h1>
				<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
					{t('marketing.hero.description')}
				</p>
				<div className="pt-4">
					<Link to="/shop/products" className="btn-primary">
						{t('marketing.hero.browse')}
					</Link>
				</div>
			</div>

			{/* Categories Grid */}
			<div>
				<h2 className="text-2xl font-semibold mb-6">{t('marketing.shopByCategory')}</h2>
				{categories.length === 0 ? (
					<div className="text-center py-12">
						<p className="text-muted-foreground">{t('marketing.noCategories')}</p>
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
									{category._count.products} {category._count.products === 1 ? t('shop.products.product_one') : t('shop.products.product_other')}
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

