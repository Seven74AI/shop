import * as Sentry from '@sentry/react-router'
import { cachified, cache } from './cache.server.ts'
import { prisma } from './db.server.ts'
import { type Timings } from './timing.server.ts'

/**
 * Get the store currency settings
 * Currency rarely (if ever) changes, so we cache it for 24 hours
 * @param options - Optional timings for server timing metrics
 * @returns The currency object with code, symbol and decimals
 */
export async function getStoreCurrency({ timings }: { timings?: Timings } = {}) {
	const result = await cachified({
		key: 'settings:currency',
		cache,
		timings,
		getFreshValue: async () => {
			const settings = await prisma.settings.findUnique({
				where: { id: 'settings' },
				include: {
					currency: {
						select: { code: true, symbol: true, decimals: true },
					},
				},
			})

			return settings?.currency ?? undefined
		},
		ttl: 1000 * 60 * 60 * 24, // 24 hours
		staleWhileRevalidate: 1000 * 60 * 60 * 24 * 7, // 7 days
	})

	// Validate cached result - if it's missing required fields, clear cache and refetch
	if (result && (!result.code || typeof result.code !== 'string')) {
		Sentry.captureMessage('Currency cache has invalid data (missing code field)', {
			level: 'warning',
			tags: { context: 'settings-currency-cache' },
		})
		await cache.delete('settings:currency')
		// Refetch without cache
		const freshSettings = await prisma.settings.findUnique({
			where: { id: 'settings' },
			include: {
				currency: {
					select: { code: true, symbol: true, decimals: true },
				},
			},
		})
		return freshSettings?.currency ?? undefined
	}

	return result
}

export type CompanySettings = {
	companyLegalName: string | null
	companyLegalForm: string | null
	companyCapital: string | null
	siret: string | null
	rcs: string | null
	vatNumber: string | null
	headOfficeAddress: string | null
	directorName: string | null
	directorContactEmail: string | null
}

/**
 * Get company legal settings for Mentions Légales (FR LCEN art. 6)
 * Cached for 1 hour since these rarely change
 */
export async function getCompanySettings({ timings }: { timings?: Timings } = {}): Promise<CompanySettings> {
	return cachified({
		key: 'settings:company',
		cache,
		timings,
		getFreshValue: async () => {
			const settings = await prisma.settings.findUnique({
				where: { id: 'settings' },
				select: {
					companyLegalName: true,
					companyLegalForm: true,
					companyCapital: true,
					siret: true,
					rcs: true,
					vatNumber: true,
					headOfficeAddress: true,
					directorName: true,
					directorContactEmail: true,
				},
			})
			return settings ?? {
				companyLegalName: null,
				companyLegalForm: null,
				companyCapital: null,
				siret: null,
				rcs: null,
				vatNumber: null,
				headOfficeAddress: null,
				directorName: null,
				directorContactEmail: null,
			}
		},
		ttl: 1000 * 60 * 60, // 1 hour
		staleWhileRevalidate: 1000 * 60 * 60 * 24, // 24 hours
	})
}

