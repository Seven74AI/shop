import * as Sentry from '@sentry/react-router'
import { type ServerBuild } from 'react-router'
import { prisma } from './db.server.ts'

type RouteMetadata = {
	lastmod?: string
	priority: string
	changefreq: string
	images?: { loc: string; title?: string }[]
}

type RouteEntry = {
	path: string
	metadata: RouteMetadata
}

/**
 * Fetches dynamic routes from database (products and categories)
 * with updatedAt for lastmod and images for image sitemap
 */
async function getDynamicRoutes(): Promise<RouteEntry[]> {
	const entries: RouteEntry[] = []

	try {
		// Get all active products with images
		const products = await prisma.product.findMany({
			where: {
				status: 'ACTIVE',
			},
			select: {
				slug: true,
				updatedAt: true,
				images: {
					select: { objectKey: true, altText: true },
					orderBy: { displayOrder: 'asc' },
				},
			},
		})

		for (const product of products) {
			const path = `/shop/products/${product.slug}`
			entries.push({
				path,
				metadata: {
					lastmod: product.updatedAt.toISOString(),
					priority: '0.9',
					changefreq: 'daily',
					images: product.images
						.filter((img) => img.objectKey)
						.map((img) => ({
							loc: `/resources/images?objectKey=${encodeURIComponent(img.objectKey)}`,
							title: img.altText || undefined,
						})),
				},
			})
		}

		// Get all categories
		const categories = await prisma.category.findMany({
			select: {
				slug: true,
				updatedAt: true,
			},
		})

		for (const category of categories) {
			entries.push({
				path: `/shop/categories/${category.slug}`,
				metadata: {
					lastmod: category.updatedAt.toISOString(),
					priority: '0.7',
					changefreq: 'weekly',
				},
			})
		}
	} catch (error) {
		// If database query fails, log but don't break the sitemap generation
		Sentry.captureException(error, {
			tags: { context: 'sitemap-dynamic-routes' },
		})
	}

	return entries
}

/**
 * Determines priority and changefreq for a static route based on its path pattern
 */
function getStaticRouteMetadata(path: string): RouteMetadata {
	// Root page gets highest priority
	if (path === '/') {
		return { priority: '1.0', changefreq: 'daily' }
	}

	// Shop main page
	if (path === '/shop') {
		return { priority: '0.9', changefreq: 'daily' }
	}

	// Product listing
	if (path === '/shop/products') {
		return { priority: '0.8', changefreq: 'daily' }
	}

	// Marketing pages (about, tos, privacy, support)
	if (['/about', '/tos', '/privacy', '/support'].includes(path)) {
		return { priority: '0.5', changefreq: 'monthly' }
	}

	// Default for other public pages
	return { priority: '0.6', changefreq: 'weekly' }
}

/**
 * Extracts public routes from React Router build that should be included in sitemap
 */
function extractPublicRoutes(routes: ServerBuild['routes']): RouteEntry[] {
	const publicRoutes: RouteEntry[] = []
	const routesToIgnore = [
		// Resource routes
		'/resources',
		'/sitemap.xml',
		'/robots.txt',
		// Admin routes
		'/admin',
		// Auth routes
		'/login',
		'/signup',
		'/logout',
		'/forgot-password',
		'/reset-password',
		'/verify',
		'/onboarding',
		'/auth',
		// User settings
		'/settings',
		'/me',
		// API/webhooks
		'/webhooks',
		// Checkout (not indexed)
		'/shop/checkout',
		// Account pages (not for indexing)
		'/account',
		// User profile pages
		'/users',
		// 404 catch-all
		'$',
	]

	function shouldIncludeRoute(path: string | undefined): boolean {
		if (!path) return false

		// Ignore routes that match any ignore pattern
		for (const ignorePattern of routesToIgnore) {
			if (path.startsWith(ignorePattern) || path === ignorePattern) {
				return false
			}
		}

		// Include public shop routes
		if (path.startsWith('/shop')) return true

		// Include marketing routes
		if (path.startsWith('/')) {
			const segments = path.split('/').filter(Boolean)
			// Exclude auth, admin, settings, etc.
			if (segments.length === 0) return true // root
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
					'account',
					'users',
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

			// Handle index routes
			if (route.index) {
				routePath = parentPath || '/'
			} else if (routePath) {
				// Handle relative paths
				if (routePath.startsWith('/')) {
					routePath = routePath
				} else {
					routePath = `${parentPath}/${routePath}`.replace(/\/+/g, '/')
				}
			} else {
				routePath = parentPath
			}

			// Normalize path
			routePath = routePath || '/'

			// Check if this route should be included
			if (shouldIncludeRoute(routePath)) {
				// Normalize: remove trailing slashes except for root
				const normalizedPath =
					routePath === '/' ? '/' : routePath.replace(/\/$/, '')

				// Check if already added (deduplicate)
				if (!publicRoutes.find((r) => r.path === normalizedPath)) {
					publicRoutes.push({
						path: normalizedPath,
						metadata: getStaticRouteMetadata(normalizedPath),
					})
				}
			}

			// Recursively process children
			const routeWithChildren = route as ServerBuild['routes'][string] & {
				children?: ServerBuild['routes']
			}
			if (routeWithChildren.children) {
				traverseRoutes(routeWithChildren.children, routePath)
			}
		}
	}

	traverseRoutes(routes)
	publicRoutes.sort((a, b) => a.path.localeCompare(b.path))
	return publicRoutes
}

/**
 * Generates XML sitemap from routes with metadata
 */
function generateSitemapXML(
	entries: RouteEntry[],
	siteUrl: string,
): string {
	const urlElements = entries
		.map((entry) => {
			const url = `${siteUrl}${entry.path === '/' ? '' : entry.path}`
			const parts: string[] = [
				`\t<url>`,
				`\t\t<loc>${escapeXml(url)}</loc>`,
			]

			if (entry.metadata.lastmod) {
				parts.push(`\t\t<lastmod>${entry.metadata.lastmod}</lastmod>`)
			}

			parts.push(`\t\t<changefreq>${entry.metadata.changefreq}</changefreq>`)
			parts.push(`\t\t<priority>${entry.metadata.priority}</priority>`)

			// Add image entries for product pages
			if (entry.metadata.images && entry.metadata.images.length > 0) {
				for (const image of entry.metadata.images) {
					const imageUrl = `${siteUrl}${image.loc}`
					parts.push(
						`\t\t<image:image>`,
						`\t\t\t<image:loc>${escapeXml(imageUrl)}</image:loc>`,
					)
					if (image.title) {
						parts.push(
							`\t\t\t<image:title>${escapeXml(image.title)}</image:title>`,
						)
					}
					parts.push(`\t\t</image:image>`)
				}
			}

			parts.push(`\t</url>`)
			return parts.join('\n')
		})
		.join('\n')

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlElements}
</urlset>`
}

/**
 * Escapes XML special characters
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
 * Generates sitemap for React Router 7 application
 * Includes both static routes from the build and dynamic routes from the database
 */
export async function generateSitemap(
	build: ServerBuild,
	siteUrl: string,
): Promise<string> {
	// Get static routes from React Router build
	const staticRoutes = extractPublicRoutes(build.routes)

	// Get dynamic routes from database (products and categories) with metadata
	const dynamicRoutes = await getDynamicRoutes()

	// Merge: dynamic routes override static ones (they have richer metadata)
	const staticPathSet = new Set(staticRoutes.map((r) => r.path))
	const merged: RouteEntry[] = [...staticRoutes]

	for (const dynRoute of dynamicRoutes) {
		if (!staticPathSet.has(dynRoute.path)) {
			merged.push(dynRoute)
		} else {
			// Replace static entry with dynamic one (which has lastmod, images)
			const idx = merged.findIndex((r) => r.path === dynRoute.path)
			if (idx !== -1) {
				merged[idx] = dynRoute
			}
		}
	}

	merged.sort((a, b) => a.path.localeCompare(b.path))
	return generateSitemapXML(merged, siteUrl)
}
