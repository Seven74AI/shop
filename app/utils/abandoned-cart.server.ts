import * as Sentry from '@sentry/react-router'
import { AbandonedCartEmailTemplate } from './abandoned-cart-email.server.tsx'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { createRecoveryToken } from './recovery-token.server.ts'

const DEFAULT_ABANDONED_HOURS = 1
const MAX_RECOVERY_EMAILS_PER_CART = 3

/**
 * Finds carts that are considered abandoned:
 * - Has at least one item
 * - Last updated more than `hoursThreshold` ago
 * - Belongs to an authenticated user (has userId)
 * - Has no recovery email sent within the last `hoursThreshold` hours
 * - Has fewer than MAX_RECOVERY_EMAILS_PER_CART recovery emails total
 *
 * @param hoursThreshold - Hours of inactivity to consider a cart abandoned (default: 1)
 * @returns Array of abandoned carts with user email
 */
export async function findAbandonedCarts(hoursThreshold = DEFAULT_ABANDONED_HOURS) {
	const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000)

	// Get all carts with items, belonging to users, not updated recently
	const carts = await prisma.cart.findMany({
		where: {
			userId: { not: null },
			items: { some: {} },
			updatedAt: { lt: cutoff },
		},
		include: {
			items: {
				include: {
					product: true,
					variant: true,
				},
			},
			user: {
				select: { id: true, email: true },
			},
			abandonedCartEmails: {
				orderBy: { sentAt: 'desc' },
				take: MAX_RECOVERY_EMAILS_PER_CART,
			},
		},
	})

	// Filter out carts that:
	// - Have no user email
	// - Already received a recovery email within the threshold window
	// - Already received the max number of recovery emails
	// - User has opted out of marketing emails
	return carts.filter((cart) => {
		if (!cart.user?.email) return false
		if (cart.abandonedCartEmails.length >= MAX_RECOVERY_EMAILS_PER_CART)
			return false

		const recentEmail = cart.abandonedCartEmails.find(
			(e) => e.sentAt > cutoff,
		)
		if (recentEmail) return false

		return true
	})
}

/**
 * Sends an abandoned cart recovery email to the user.
 * Returns the created AbandonedCartEmail record.
 */
export async function sendAbandonedCartRecoveryEmail(
	cartId: string,
	userId: string,
	email: string,
	items: Array<{
		productName: string
		productImage?: string
		price: number
		quantity: number
	}>,
	request?: Request,
) {
	const token = createRecoveryToken(cartId, userId)
	const domainUrl = request
		? getDomainUrlFromRequest(request)
		: process.env.HOST_URL ?? 'https://shop.example'

	const recoveryUrl = `${domainUrl}/recover-cart?token=${token}`

	try {
		const result = await sendEmail({
			to: email,
			subject: "You left items in your cart 🛒",
			marketing: true,
			react: AbandonedCartEmailTemplate({
				items,
				recoveryUrl,
			}),
		})

		if (result.status === 'error') {
			Sentry.captureMessage('Failed to send abandoned cart recovery email', {
				level: 'error',
				extra: { cartId, userId, email, error: result.error },
			})
			return null
		}

		// Record the sent email
		const record = await prisma.abandonedCartEmail.create({
			data: {
				cartId,
				userId,
				email,
				token,
			},
		})

		return record
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'abandoned-cart-recovery' },
			extra: { cartId, userId, email },
		})
		return null
	}
}

/**
 * Marks an abandoned cart recovery email as recovered (user returned and completed action).
 */
export async function markRecovered(token: string) {
	const record = await prisma.abandonedCartEmail.findUnique({
		where: { token },
	})

	if (!record || record.recovered) return null

	return prisma.abandonedCartEmail.update({
		where: { id: record.id },
		data: {
			recovered: true,
			recoveredAt: new Date(),
		},
	})
}

/**
 * Runs the abandoned cart recovery process:
 * 1. Finds abandoned carts
 * 2. Sends recovery emails
 * 3. Returns a summary
 */
export async function processAbandonedCarts(
	hoursThreshold?: number,
	request?: Request,
) {
	const abandonedCarts = await findAbandonedCarts(hoursThreshold)

	let sent = 0
	let failed = 0
	const errors: Error[] = []

	for (const cart of abandonedCarts) {
		if (!cart.user?.email) continue

		const items = cart.items.map((item) => ({
			productName: item.product.name,
			productImage: undefined,
			price: Number(item.variant?.price ?? item.product.price),
			quantity: item.quantity,
		}))

		const result = await sendAbandonedCartRecoveryEmail(
			cart.id,
			cart.user.id,
			cart.user.email,
			items,
			request,
		)

		if (result) {
			sent++
		} else {
			failed++
		}
	}

	return {
		total: abandonedCarts.length,
		sent,
		failed,
		errors,
	}
}

function getDomainUrlFromRequest(request: Request): string {
	const url = new URL(request.url)
	return `${url.protocol}//${url.host}`
}
