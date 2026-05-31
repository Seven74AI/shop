import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
	cachified as baseCachified,
	verboseReporter,
	mergeReporters,
	type CacheEntry,
	type Cache as CachifiedCache,
	type CachifiedOptions,
	type Cache,
	totalTtl,
	type CreateReporter,
} from '@epic-web/cachified'
import { remember } from '@epic-web/remember'
import * as Sentry from '@sentry/react-router'
import { LRUCache } from 'lru-cache'
import { z } from 'zod'
// import { updatePrimaryCacheValue } from '#app/routes/admin+/cache_.sqlite.server.ts'
import { getInstanceInfo, getInstanceInfoSync } from './litefs.server.ts'
import { cachifiedTimingReporter, type Timings } from './timing.server.ts'

const _rawCachePath = process.env.CACHE_DATABASE_PATH || './other/cache.db'

// In test mode, multiple vitest workers share the same filesystem.
// Appending the process PID to the database path prevents SQLITE_IOERR
// (disk I/O error) from concurrent access to the same file.
const CACHE_DATABASE_PATH =
	process.env.NODE_ENV === 'test' && _rawCachePath.startsWith('/tmp')
		? _rawCachePath.replace(/\.db$/, `-pid${process.pid}.db`)
		: _rawCachePath

const cacheDb = remember('cacheDb', createDatabase)

function createDatabase(tryAgain = true): DatabaseSync {
	const parentDir = path.dirname(CACHE_DATABASE_PATH)
	fs.mkdirSync(parentDir, { recursive: true })

	const db = new DatabaseSync(CACHE_DATABASE_PATH)
	let currentIsPrimary = true
	try {
		currentIsPrimary = getInstanceInfoSync().currentIsPrimary
	} catch {
		// LITEFS_DIR not set — running outside of LiteFS (dev/test/production without LiteFS).
		// Default to primary so the cache DB is initialized.
	}
	if (!currentIsPrimary) return db

	try {
		// create cache table with metadata JSON column and value JSON column if it does not exist already
		db.exec(`
			CREATE TABLE IF NOT EXISTS cache (
				key TEXT PRIMARY KEY,
				metadata TEXT,
				value TEXT
			)
		`)
	} catch (error: unknown) {
		try { fs.unlinkSync(CACHE_DATABASE_PATH) } catch {}
		if (tryAgain) {
			Sentry.captureException(error, {
				tags: { context: 'cache-database-creation' },
				extra: { cachePath: CACHE_DATABASE_PATH },
			})
			return createDatabase(false)
		}
		throw error
	}

	return db
}

const lru = remember(
	'lru-cache',
	() => new LRUCache<string, CacheEntry<unknown>>({ max: 5000 }),
)

export const lruCache = {
	name: 'app-memory-cache',
	set: (key, value) => {
		const ttl = totalTtl(value?.metadata)
		lru.set(key, value, {
			ttl: ttl === Infinity ? undefined : ttl,
			start: value?.metadata?.createdTime,
		})
		return value
	},
	get: (key) => lru.get(key),
	delete: (key) => lru.delete(key),
} satisfies Cache

const isBuffer = (obj: unknown): obj is Buffer =>
	Buffer.isBuffer(obj) || obj instanceof Uint8Array

function bufferReplacer(_key: string, value: unknown) {
	if (isBuffer(value)) {
		return {
			__isBuffer: true,
			data: value.toString('base64'),
		}
	}
	return value
}

function bufferReviver(_key: string, value: unknown) {
	if (
		value &&
		typeof value === 'object' &&
		'__isBuffer' in value &&
		(value as any).data
	) {
		return Buffer.from((value as any).data, 'base64')
	}
	return value
}

const cacheEntrySchema = z.object({
	metadata: z.object({
		createdTime: z.number(),
		ttl: z.number().nullable().optional(),
		swr: z.number().nullable().optional(),
	}),
	value: z.unknown(),
})
const cacheQueryResultSchema = z.object({
	metadata: z.string(),
	value: z.string(),
})

const getStatement = cacheDb.prepare(
	'SELECT value, metadata FROM cache WHERE key = ?',
)
const setStatement = cacheDb.prepare(
	'INSERT OR REPLACE INTO cache (key, value, metadata) VALUES (?, ?, ?)',
)
const deleteStatement = cacheDb.prepare('DELETE FROM cache WHERE key = ?')
const getAllKeysStatement = cacheDb.prepare('SELECT key FROM cache LIMIT ?')
const searchKeysStatement = cacheDb.prepare(
	'SELECT key FROM cache WHERE key LIKE ? LIMIT ?',
)

export const cache: CachifiedCache = {
	name: 'SQLite cache',
	async get(key) {
		const result = getStatement.get(key)
		const parseResult = cacheQueryResultSchema.safeParse(result)
		if (!parseResult.success) return null

		const parsedEntry = cacheEntrySchema.safeParse({
			metadata: JSON.parse(parseResult.data.metadata),
			value: JSON.parse(parseResult.data.value, bufferReviver),
		})
		if (!parsedEntry.success) return null
		const { metadata, value } = parsedEntry.data
		if (!value) return null
		return { metadata, value }
	},
	async set(key, entry) {
		const { currentIsPrimary, primaryInstance: ignoredPrimaryInstance } = await getInstanceInfo()

		if (currentIsPrimary) {
			// Handle undefined values - SQLite can't bind undefined, so convert to null
			const value = entry.value === undefined 
				? JSON.stringify(null) 
				: JSON.stringify(entry.value, bufferReplacer)
			setStatement.run(key, value, JSON.stringify(entry.metadata))
		} else {
			// fire-and-forget cache update
			// void updatePrimaryCacheValue({
			// 	key,
			// 	cacheValue: entry,
			// }).then((response) => {
			// 	if (!response.ok) {
			// 		console.error(
			// 			`Error updating cache value for key "${key}" on primary instance (${primaryInstance}): ${response.status} ${response.statusText}`,
			// 			{ entry },
			// 		)
			// 	}
			// })
		}
	},
	async delete(key) {
		const { currentIsPrimary, primaryInstance: ignoredPrimaryInstance } = await getInstanceInfo()

		if (currentIsPrimary) {
			deleteStatement.run(key)
		} else {
			// fire-and-forget cache update
			// void updatePrimaryCacheValue({
			// 	key,
			// 	cacheValue: undefined,
			// }).then((response) => {
			// 	if (!response.ok) {
			// 		console.error(
			// 			`Error deleting cache value for key "${key}" on primary instance (${primaryInstance}): ${response.status} ${response.statusText}`,
			// 		)
			// 	}
			// })
		}
	},
}

export async function getAllCacheKeys(limit: number) {
	return {
		sqlite: getAllKeysStatement
			.all(limit)
			.map((row) => (row as { key: string }).key),
		lru: [...lru.keys()],
	}
}

export async function searchCacheKeys(search: string, limit: number) {
	return {
		sqlite: searchKeysStatement
			.all(`%${search}%`, limit)
			.map((row) => (row as { key: string }).key),
		lru: [...lru.keys()].filter((key) => key.includes(search)),
	}
}

export async function cachified<Value>(
	{
		timings,
		...options
	}: CachifiedOptions<Value> & {
		timings?: Timings
	},
	reporter: CreateReporter<Value> = verboseReporter<Value>(),
): Promise<Value> {
	return baseCachified(
		options,
		mergeReporters(cachifiedTimingReporter(timings), reporter),
	)
}
