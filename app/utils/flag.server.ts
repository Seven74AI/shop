import { createHash } from 'node:crypto'
import { remember } from '@epic-web/remember'
import {
	FlagAudienceSchema,
	type FlagAudience,
} from '#app/schemas/flag.ts'
import { prisma } from '#app/utils/db.server.ts'

// ---------------------------------------------------------------------------
// In-memory cache (30s TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
	flags: Record<string, CachedFlag>
	ts: number
}

interface CachedFlag {
	enabled: boolean
	rolloutPercentage: number | null
	audience: string | null
}

const CACHE_TTL_MS = 30_000 // 30 seconds

const cache = remember('feature-flags-cache', () => {
	const state = { current: null as CacheEntry | null }
	return state
})

async function getFlagsFromCache(): Promise<Record<string, CachedFlag>> {
	const now = Date.now()
	if (cache.current && now - cache.current.ts < CACHE_TTL_MS) {
		return cache.current.flags
	}

	const flags = await prisma.flag.findMany()
	const flagMap: Record<string, CachedFlag> = {}
	for (const f of flags) {
		flagMap[f.key] = {
			enabled: f.enabled,
			rolloutPercentage: f.rolloutPercentage,
			audience: f.audience,
		}
	}
	cache.current = { flags: flagMap, ts: now }
	return flagMap
}

/** Invalidate the in-memory cache — call after CRUD mutations. */
export function invalidateFlagCache(): void {
	cache.current = null
}

// ---------------------------------------------------------------------------
// Rollout hash (deterministic)
// ---------------------------------------------------------------------------

/**
 * Deterministic rollout hash.
 * sha256(flagKey + userId) mod 100 → integer 0–99.
 * Returns true if the hash value is less than rolloutPercentage.
 */
function isInRollout(flagKey: string, userId: string, rolloutPercentage: number): boolean {
	const hash = createHash('sha256')
	hash.update(flagKey + userId)
	const digest = hash.digest()
	// Take first 4 bytes as a 32-bit unsigned integer, then mod 100
	const num = digest.readUInt32BE(0) % 100
	return num < rolloutPercentage
}

// ---------------------------------------------------------------------------
// Audience matching
// ---------------------------------------------------------------------------

function matchesAudience(
	audience: FlagAudience,
	ctx: { userId?: string; country?: string; roles?: string[] },
): boolean {
	const hasUserFilter = !!audience.userIds?.length
	const hasCountryFilter = !!audience.countries?.length
	const hasRoleFilter = !!audience.roles?.length
	const hasAnyFilter = hasUserFilter || hasCountryFilter || hasRoleFilter

	// No audience filters → everyone matches
	if (!hasAnyFilter) return true

	if (hasUserFilter && ctx.userId) {
		if (audience.userIds!.includes(ctx.userId)) return true
	}
	if (hasCountryFilter && ctx.country) {
		if (audience.countries!.includes(ctx.country)) return true
	}
	if (hasRoleFilter && ctx.roles?.length) {
		for (const role of ctx.roles) {
			if (audience.roles!.includes(role)) return true
		}
	}

	// Audience has filters but none matched → false
	return false
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FlagContext {
	userId?: string
	country?: string
	roles?: string[]
}

/**
 * Check whether a feature flag is enabled for the given context.
 *
 * Decision order:
 * 1. Flag not found → false
 * 2. `enabled` is false → false
 * 3. Audience filter → if set and ctx matches, return true
 * 4. Rollout percentage → deterministic hash-based gate
 * 5. `enabled` is true and no audience/rollout → true
 *
 * @param key - The flag key to check.
 * @param ctx - Optional context (userId, country, roles).
 * @returns Promise<boolean>
 */
export async function isFlagEnabled(
	key: string,
	ctx?: FlagContext,
): Promise<boolean> {
	const flags = await getFlagsFromCache()
	const flag = flags[key]
	if (!flag) return false
	if (!flag.enabled) return false

	// Check audience filter first (it can override rollout)
	if (flag.audience) {
		let audience: FlagAudience
		try {
			audience = FlagAudienceSchema.parse(JSON.parse(flag.audience))
		} catch {
			// Invalid JSON → deny (fail-closed)
			return false
		}

		const audienceMatch = matchesAudience(audience, ctx ?? {})
		if (audienceMatch) return true
	}

	// Rollout percentage
	if (flag.rolloutPercentage != null && flag.rolloutPercentage >= 0 && flag.rolloutPercentage <= 100) {
		if (ctx?.userId) {
			return isInRollout(key, ctx.userId, flag.rolloutPercentage)
		}
		// No userId → can't perform rollout hash, so rollout can't gate.
		// If audience was set but didn't match, deny.
		if (flag.audience) return false
		// No userId and no audience → rollout doesn't apply, fall through to enabled.
	}

	// Plain enabled flag with no audience/rollout constraints
	return true
}
