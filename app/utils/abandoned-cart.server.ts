import { type PrismaClient } from '@prisma/client'
import { prisma } from './db.server.ts'

/**
 * Configuration options for abandoned cart detection.
 */
export interface AbandonedCartOptions {
	/** Hours of inactivity before a cart is considered abandoned (default: 24) */
	abandonmentThresholdHours?: number
	/** Minimum hours between recovery emails for the same cart (default: 24) */
	recoveryCooldownHours?: number
	/** Maximum number of recovery emails to send per cart (default: 3) */
	maxRecoveryEmails?: number
	/** Maximum number of abandoned carts to return (default: 50) */
	limit?: number
}

/**
 * A cart that appears to have been abandoned — has items, no recent activity,
 * and hasn't received a recovery email recently.
 */
export interface AbandonedCart {
	id: string
	userId: string | null
	sessionId: string | null
	updatedAt: Date
	recoveryEmailCount: number
	recoveryEmailSentAt: Date | null
	items: Array<{
		productId: string
		productName: string
		productSlug: string
		variantId: string | null
		quantity: number
	}>
}

/**
 * Finds carts that appear abandoned: have items, haven't been modified
 * for at least `abandonmentThresholdHours`, and haven't had a recovery
 * email sent within `recoveryCooldownHours` (or never).
 *
 * Since carts are deleted atomically on order creation, any remaining
 * cart with items is inherently "unfinished" — the user never completed
 * checkout. We additionally filter by:
 *   - `updatedAt` older than the abandonment threshold
 *   - No recent recovery email (cooldown window)
 *   - Under max recovery email count
 *
 * Results are ordered oldest-first so the longest-abandoned carts
 * get recovery attention first.
 *
 * @param client - PrismaClient instance (defaults to shared `prisma`)
 * @param options - Threshold and limit configuration
 * @returns Array of abandoned carts with item details (product name, slug, quantity)
 */
export async function findAbandonedCarts(
	client: PrismaClient = prisma,
	options: AbandonedCartOptions = {},
): Promise<AbandonedCart[]> {
	const {
		abandonmentThresholdHours = 24,
		recoveryCooldownHours = 24,
		maxRecoveryEmails = 3,
		limit = 50,
	} = options

	const abandonedThreshold = new Date(
		Date.now() - abandonmentThresholdHours * 60 * 60 * 1000,
	)
	const recoveryCooldown = new Date(
		Date.now() - recoveryCooldownHours * 60 * 60 * 1000,
	)

	const carts = await client.cart.findMany({
		where: {
			updatedAt: { lt: abandonedThreshold },
			OR: [
				{ recoveryEmailSentAt: null },
				{ recoveryEmailSentAt: { lt: recoveryCooldown } },
			],
			recoveryEmailCount: { lt: maxRecoveryEmails },
			items: { some: {} },
		},
		include: {
			items: {
				include: {
					product: {
						select: { id: true, name: true, slug: true },
					},
				},
			},
		},
		orderBy: { updatedAt: 'asc' },
		take: limit,
	})

	return carts.map((cart) => ({
		id: cart.id,
		userId: cart.userId,
		sessionId: cart.sessionId,
		updatedAt: cart.updatedAt,
		recoveryEmailCount: cart.recoveryEmailCount,
		recoveryEmailSentAt: cart.recoveryEmailSentAt,
		items: cart.items.map((item) => ({
			productId: item.productId,
			productName: item.product?.name ?? 'Unknown',
			productSlug: item.product?.slug ?? 'unknown',
			variantId: item.variantId,
			quantity: item.quantity,
		})),
	}))
}

/**
 * Records that a recovery email was sent for a cart.
 * Increments the recovery counter and updates the sent-at timestamp.
 *
 * @param cartId - The cart that received a recovery email
 * @param client - PrismaClient instance (defaults to shared `prisma`)
 */
export async function markRecoveryEmailSent(
	cartId: string,
	client: PrismaClient = prisma,
): Promise<void> {
	await client.cart.update({
		where: { id: cartId },
		data: {
			recoveryEmailSentAt: new Date(),
			recoveryEmailCount: { increment: 1 },
		},
	})
}

/**
 * Cleans up abandoned guest carts (no userId) that are older than
 * the given threshold and have no items. Useful as a periodic
 * maintenance task to keep the cart table lean.
 *
 * @param olderThanHours - Delete carts not modified for this many hours (default: 168 = 7 days)
 * @param client - PrismaClient instance (defaults to shared `prisma`)
 * @returns Number of guest carts deleted
 */
export async function cleanupStaleGuestCarts(
	olderThanHours = 168,
	client: PrismaClient = prisma,
): Promise<number> {
	const threshold = new Date(
		Date.now() - olderThanHours * 60 * 60 * 1000,
	)

	const result = await client.cart.deleteMany({
		where: {
			userId: null,
			updatedAt: { lt: threshold },
			items: { none: {} },
		},
	})

	return result.count
}
