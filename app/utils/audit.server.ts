/**
 * Audit Log System
 *
 * Provides fire-and-forget audit logging for admin mutations.
 * Never blocks the request — errors are caught and reported to Sentry.
 *
 * @see https://github.com/mnlamart/shop/issues/145
 */

import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/react-router'
import { prisma } from '#app/utils/db.server.ts'

/**
 * Arguments for a single audit log entry.
 */
export interface AuditLogArgs {
	/** The action performed, e.g. "order.statusUpdated", "product.created" */
	action: string
	/** The entity type, e.g. "Order", "Product", "User" */
	entityType: string
	/** The entity's unique identifier */
	entityId: string
	/** The user who performed the action (optional for system actions) */
	actorUserId?: string | null
	/** The email of the actor (optional fallback if userId unavailable) */
	actorEmail?: string | null
	/** Optional state snapshot before the mutation */
	before?: unknown | null
	/** Optional state snapshot after the mutation */
	after?: unknown | null
	/** Optional request/correlation ID for tracing */
	requestId?: string | null
}

/**
 * Fire-and-forget audit log writer.
 *
 * Writes an AuditLog row to the database. Errors are caught and reported to
 * Sentry but NEVER thrown — the caller's request must not fail because of
 * audit logging.
 *
 * @param args - The audit log entry details
 */
export async function auditLog(args: AuditLogArgs): Promise<void> {
	try {
		await prisma.auditLog.create({
			data: {
				action: args.action,
				entityType: args.entityType,
				entityId: args.entityId,
				actorUserId: args.actorUserId ?? null,
				actorEmail: args.actorEmail ?? null,
				before: args.before != null ? (args.before as object) : Prisma.JsonNull,
				after: args.after != null ? (args.after as object) : Prisma.JsonNull,
				requestId: args.requestId ?? null,
			},
		})
	} catch (error) {
		// Fire-and-forget: never throw, just report to Sentry
		Sentry.captureException(error, {
			tags: { component: 'audit-log' },
			extra: {
				action: args.action,
				entityType: args.entityType,
				entityId: args.entityId,
			},
		})
	}
}

/**
 * Configuration for the withAudit higher-order wrapper.
 */
export interface WithAuditConfig {
	/** The action name, e.g. "order.statusUpdated" */
	action: string
	/** The entity type, e.g. "Order" */
	entityType: string
	/** The entity's unique identifier */
	entityId: string
	/** Optional actor user ID */
	actorUserId?: string | null
	/** Optional actor email */
	actorEmail?: string | null
	/** Optional request/correlation ID */
	requestId?: string | null
	/** Async function that returns the entity state BEFORE the mutation */
	getBefore?: () => Promise<unknown | null>
	/** Async function that returns the entity state AFTER the mutation */
	getAfter?: () => Promise<unknown | null>
}

/**
 * Higher-order wrapper that adds audit logging to a mutation.
 *
 * 1. Loads the "before" snapshot (if getBefore is provided)
 * 2. Runs the mutation
 * 3. Loads the "after" snapshot (if getAfter is provided)
 * 4. Fire-and-forget calls auditLog (never blocks or throws)
 *
 * @param config - Audit configuration (action, entity, optional snapshots)
 * @param mutationFn - The mutation to wrap
 * @returns The mutation's return value
 *
 * @example
 * ```ts
 * const result = await withAudit(
 *   {
 *     action: 'order.statusUpdated',
 *     entityType: 'Order',
 *     entityId: order.id,
 *     actorUserId: user.id,
 *     getBefore: () => prisma.order.findUnique({ where: { id: order.id } }),
 *     getAfter: () => prisma.order.findUnique({ where: { id: order.id } }),
 *   },
 *   async () => {
 *     return await prisma.order.update({ where: { id: order.id }, data: { status: 'SHIPPED' } })
 *   },
 * )
 * ```
 */
export async function withAudit<T>(
	config: WithAuditConfig,
	mutationFn: () => Promise<T>,
): Promise<T> {
	// 1. Load before snapshot
	let before: unknown | null = null
	if (config.getBefore) {
		try {
			before = await config.getBefore()
		} catch {
			// If we can't load the snapshot, continue anyway
			before = null
		}
	}

	// 2. Run the mutation (let errors propagate to caller)
	const result = await mutationFn()

	// 3. Load after snapshot
	let after: unknown | null = null
	if (config.getAfter) {
		try {
			after = await config.getAfter()
		} catch {
			// If we can't load the snapshot, continue anyway
			after = null
		}
	}

	// 4. Audit log (errors caught internally, never propagated)
	await auditLog({
		action: config.action,
		entityType: config.entityType,
		entityId: config.entityId,
		actorUserId: config.actorUserId,
		actorEmail: config.actorEmail,
		requestId: config.requestId,
		before,
		after,
	})

	return result
}
