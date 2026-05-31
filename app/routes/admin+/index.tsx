import { useTranslation } from '#app/utils/i18n.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	
	// Get statistics for the dashboard
	const [productCount, categoryCount, attributeCount] = await Promise.all([
		prisma.product.count(),
		prisma.category.count(),
		prisma.attribute.count(),
	])
	
	return {
		stats: {
			products: productCount,
			categories: categoryCount,
			attributes: attributeCount,
		},
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Admin Dashboard | Epic Shop' },
	{ name: 'description', content: 'Admin dashboard for managing products and categories' },
]

export default function AdminDashboard() {
	const { t } = useTranslation()
	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">{t('admin.dashboard')}</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{t('admin.manageStore')}
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{/* Products Management Card */}
				<Card className="rounded-[14px]">
					<CardContent className="p-6">
						<div className="flex items-center space-x-4">
							<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
								<Icon name="archive" className="h-6 w-6 text-primary" />
							</div>
							<div className="flex-1">
								<h2 className="text-base font-normal text-foreground">{t('admin.nav.products')}</h2>
								<p className="text-sm text-muted-foreground">
									{t('admin.manageCatalog')}
								</p>
							</div>
						</div>
						<div className="mt-4 space-y-2">
							<Button asChild className="w-full h-9 rounded-lg font-medium">
								<a href="/admin/products">{t('admin.viewProducts')}</a>
							</Button>
							<Button asChild variant="outline" className="w-full h-9 rounded-lg font-medium">
								<a href="/admin/products/new">{t('admin.addProduct')}</a>
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Categories Management Card */}
				<Card className="rounded-[14px]">
					<CardContent className="p-6">
						<div className="flex items-center space-x-4">
							<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
								<Icon name="tags" className="h-6 w-6 text-primary" />
							</div>
							<div className="flex-1">
								<h2 className="text-base font-normal text-foreground">{t('admin.nav.categories')}</h2>
								<p className="text-sm text-muted-foreground">
									{t('admin.organizeProducts')}
								</p>
							</div>
						</div>
						<div className="mt-4 space-y-2">
							<Button asChild className="w-full h-9 rounded-lg font-medium">
								<a href="/admin/categories">{t('admin.viewCategories')}</a>
							</Button>
							<Button asChild variant="outline" className="w-full h-9 rounded-lg font-medium">
								<a href="/admin/categories/new">{t('admin.addCategory')}</a>
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Attributes Card */}
				<Card className="rounded-[14px]">
					<CardContent className="p-6">
						<div className="flex items-center space-x-4">
							<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
								<Icon name="settings" className="h-6 w-6 text-primary" />
							</div>
							<div className="flex-1">
								<h2 className="text-base font-normal text-foreground">{t('admin.nav.attributes')}</h2>
								<p className="text-sm text-muted-foreground">
									{t('admin.configureAttributes')}
								</p>
							</div>
						</div>
						<div className="mt-4 space-y-2">
							<Button asChild className="w-full h-9 rounded-lg font-medium">
								<a href="/admin/attributes">{t('admin.viewAttributes')}</a>
							</Button>
							<Button asChild variant="outline" className="w-full h-9 rounded-lg font-medium">
								<a href="/admin/attributes/new">{t('admin.addAttribute')}</a>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Quick Actions */}
			<div>
				<h2 className="text-base font-normal text-foreground mb-4">{t('admin.quickActions')}</h2>
				<div className="flex flex-wrap gap-4">
					<Button asChild className="h-9 rounded-lg font-medium">
						<a href="/admin/products/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							{t('admin.createProduct')}
						</a>
					</Button>
					<Button asChild variant="outline" className="h-9 rounded-lg font-medium">
						<a href="/admin/categories/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							{t('admin.createCategory')}
						</a>
					</Button>
					<Button asChild variant="outline" className="h-9 rounded-lg font-medium">
						<a href="/admin/attributes/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							{t('admin.createAttribute')}
						</a>
					</Button>
				</div>
			</div>
		</div>
	)
}
