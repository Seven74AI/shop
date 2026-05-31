import * as Sentry from '@sentry/react-router'
import { type ServerBuild } from 'react-router'
import { prisma } from './db.server.ts'

interface RouteMetadata {
	path: string
	changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
	priority: number // 0.0 – 1.0
	lastmod?: string // ISO 8601 date
}

/**
 * Fetches dynamic routes from database (products and categories)
 * with lastmod (updatedAt) dates.
 */
async function getDynamicRouteMetadata(): Promise<RouteMetadata[]> {
	const items: RouteMetadata[] = []

	try {
		// Get all active products
		const products = await prisma.product.findMany({
			where: { status: 'ACTIVE' },
			select: { slug: true, updatedAt: true },
			take: 50000,
		})

		for (const product of products) {
			items.push({
				path: `/shop/products/${product.slug}`,
				changefreq: 'weekly',
				priority: 0.8,
				lastmod: product.updatedAt.toISOString(),
			})
		}

		// Get all categories
		const categories = await prisma.category.findMany({
			select: { slug: true, updatedAt: true },
		})

		for (const category of categories) {
			items.push({
				path: `/shop/categories/${category.slug}`,
				changefreq: 'weekly',
				priority: 0.7,
				lastmod: category.updatedAt.toISOString(),
			})
		}
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'sitemap-dynamic-routes' },
		})
	}

	return items
}

/**
 * Route-specific changefreq and priority rules.
 * Returns defaults for routes without explicit rules.
 */
function getRouteDefaults(
	routePath: string,
): Pick<RouteMetadata, 'changefreq' | 'priority'> {
	// Root
	if (routePath === '/') return { changefreq: 'daily', priority: 1.0 }

	// Product listing
	if (routePath === '/shop/products')
		return { changefreq: 'daily', priority: 0.9 }

	// Products/dynamic — handled by dynamic metadata, fallback
	if (routePath.startsWith('/shop/products/'))
		return { changefreq: 'weekly', priority: 0.8 }

	// Category listing (static route if it exists)
	if (routePath.startsWith('/shop/categories'))
		return { changefreq: 'weekly', priority: 0.7 }

	// Cart — low priority, changes frequently but not index-worthy
	if (routePath === '/shop/cart')
		return { changefreq: 'weekly', priority: 0.3 }

	// Shop index
	if (routePath === '/shop')
		return { changefreq: 'daily', priority: 0.9 }

	// Public user pages
	if (routePath.startsWith('/users'))
		return { changefreq: 'weekly', priority: 0.4 }

	// Everything else (static marketing pages etc.)
	return { changefreq: 'monthly', priority: 0.5 }
}

/**
 * Extracts public routes from React Router build that should be included in sitemap.
 */
function extractPublicRoutes(routes: ServerBuild['routes']): string[] {
	const publicRoutes: string[] = []
	const routesToIgnore = [
		'/resources',
		'/sitemap.xml',
		'/robots.txt',
		'/admin',
		'/login',
		'/signup',
		'/logout',
		'/forgot-password',
		'/reset-password',
		'/verify',
		'/onboarding',
		'/auth',
		'/settings',
		'/me',
		'/webhooks',
		'/shop/checkout',
		'$',
	]

	function shouldIncludeRoute(path: string | undefined): boolean {
		if (!path) return false

		for (const ignorePattern of routesToIgnore) {
			if (path.startsWith(ignorePattern) || path === ignorePattern) {
				return false
			}
		}

		if (path.startsWith('/shop')) return true

		if (path.startsWith('/')) {
			const segments = path.split('/').filter(Boolean)
			if (segments.length === 0) return true
			const firstSegment = segments[0]
			if (
				firstSegment &&
				![
					'admin',
					'auth',
					'settings',
					'me',
					'resources',
					'webhooks',
				].includes(firstSegment)
			) {
				return true
			}
		}

		return false
	}

	function traverseRoutes(
		routes: ServerBuild['routes'],
		parentPath: string = '',
	): void {
		for (const [, route] of Object.entries(routes)) {
			if (!route) continue

			let routePath = route.path || ''

			if (route.index) {
				routePath = parentPath || '/'
			} else if (routePath) {
				if (routePath.startsWith('/')) {
					routePath = routePath
				} else {
					routePath = `${parentPath}/${routePath}`.replace(/\/+/g, '/')
				}
			} else {
				routePath = parentPath
			}

			routePath = routePath || '/'

			if (shouldIncludeRoute(routePath)) {
				const normalizedPath =
					routePath === '/' ? '/' : routePath.replace(/\/$/, '')
				if (!publicRoutes.includes(normalizedPath)) {
					publicRoutes.push(normalizedPath)
				}
			}

			const routeWithChildren = route as ServerBuild['routes'][string] & {
				children?: ServerBuild['routes']
			}
			if (routeWithChildren.children) {
				traverseRoutes(routeWithChildren.children, routePath)
			}
		}
	}

	traverseRoutes(routes)
	return publicRoutes.sort()
}

/**
 * Generates XML sitemap from route metadata.
 */
function generateSitemapXML(
	items: RouteMetadata[],
	siteUrl: string,
): string {
	const urls = items
		.map((item) => {
			const loc = `${siteUrl}${item.path === '/' ? '' : item.path}`
			let xml = `\t<url>\n\t\t<loc>${escapeXml(loc)}</loc>`

			if (item.lastmod) {
				xml += `\n\t\t<lastmod>${escapeXml(item.lastmod)}</lastmod>`
			}
			xml += `\n\t\t<changefreq>${item.changefreq}</changefreq>`
			xml += `\n\t\t<priority>${item.priority.toFixed(1)}</priority>`
			xml += `\n\t</url>`
			return xml
		})
		.join('\n')

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
}

/**
 * Escapes XML special characters.
 */
function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

/**
 * Generates sitemap for React Router 7 application.
 * Includes both static routes from the build and dynamic routes from the database.
 * Each entry gets lastmod (when available), changefreq, and priority.
 */
export async function generateSitemap(
	build: ServerBuild,
	siteUrl: string,
): Promise<string> {
	// Get static routes from React Router build
	const staticRoutes = extractPublicRoutes(build.routes)

	// Get dynamic route metadata from database (products and categories)
	const dynamicMetadata = await getDynamicRouteMetadata()
	const dynamicPaths = new Set(dynamicMetadata.map((m) => m.path))

	// Build metadata for static routes (skip those covered by dynamic)
	const allMetadata: RouteMetadata[] = []

	for (const routePath of staticRoutes) {
		// Skip dynamic routes already covered
		if (dynamicPaths.has(routePath)) continue

		// Skip parametric routes that are covered by dynamic
		const isParametric = routePath.includes(':') || routePath.includes('*')
		if (isParametric) {
			// Check if any dynamic route matches this pattern
			const pattern = routePath.replace(/:\w+/g, '[^/]+').replace(/\*/g, '.*')
			const regex = new RegExp(`^${pattern}$`)
			if ([...dynamicPaths].some((dp) => regex.test(dp))) continue
		}

		const { changefreq, priority } = getRouteDefaults(routePath)
		allMetadata.push({ path: routePath, changefreq, priority })
	}

	// Add dynamic metadata (already has lastmod)
	allMetadata.push(...dynamicMetadata)

	// Sort by path for consistent output
	allMetadata.sort((a, b) => a.path.localeCompare(b.path))

	return generateSitemapXML(allMetadata, siteUrl)
}
