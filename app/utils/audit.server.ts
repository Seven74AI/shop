import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT'

/**
 * Minimal request shape needed for audit logging — works with both
 * Express/React Router Request objects and plain test objects.
 */
export interface AuditRequest {
	ip?: string
	headers?: Headers | Record<string, string | undefined>
}

/**
 * Writes an audit log entry for a data mutation.
 * Silently catches errors — audit logging should never block the main operation.
 *
 * @param userId - The ID of the user performing the action (null for system/anonymous)
 * @param action - The type of action performed (CREATE, UPDATE, DELETE, etc.)
 * @param entityType - The type of entity affected (e.g., "Product", "Order")
 * @param entityId - The ID of the affected entity
 * @param changes - Optional JSON diff of changes made (null for read-only actions)
 * @param req - Optional request info for IP and User-Agent capture
 */
export async function auditLog(
	userId: string | null,
	action: AuditAction,
	entityType: string,
	entityId: string,
	changes?: Record<string, unknown> | null,
	req?: AuditRequest | null,
): Promise<void> {
	try {
		let ipAddress: string | undefined
		let userAgent: string | undefined

		if (req) {
			ipAddress = req.ip
			// Support both Headers object and plain Record
			const headers = req.headers
			if (headers && 'get' in headers && typeof (headers as Headers).get === 'function') {
				userAgent = (headers as Headers).get('user-agent') ?? undefined
			} else {
				userAgent = (headers as Record<string, string | undefined>)['user-agent']
			}
		}

		await prisma.auditLog.create({
			data: {
				userId,
				action,
				entityType,
				entityId,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				changes: changes as any,
				ipAddress: ipAddress ?? null,
				userAgent: userAgent ?? null,
			},
		})
	} catch {
		// Audit logging should never throw or block the main operation.
		// Errors are silently swallowed — Sentry or similar can be added later.
	}
}

/**
 * Builds a changes diff object comparing old and new values.
 * Only includes fields where the value actually changed.
 *
 * @param before - The entity state before the mutation
 * @param after - The entity state after the mutation
 * @returns A diff object with only changed fields, or null if nothing changed
 */
export function buildChangesDiff(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
): Record<string, unknown> | null {
	const changes: Record<string, unknown> = {}

	for (const key of Object.keys(after)) {
		const beforeVal = before[key]
		const afterVal = after[key]
		if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
			changes[key] = { before: beforeVal, after: afterVal }
		}
	}

	return Object.keys(changes).length > 0 ? changes : null
}
