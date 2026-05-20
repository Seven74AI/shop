import bcrypt from 'bcryptjs'
import { http, HttpResponse } from 'msw'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { server } from '#tests/mocks'

// Mock Sentry first
vi.mock('@sentry/react-router', async () => {
	const actual = await vi.importActual('@sentry/react-router')
	return {
		...actual,
		captureException: vi.fn(),
		captureMessage: vi.fn(),
	}
})

// Mock prisma for lockout tests
const mockPrisma = {
	user: {
		findUnique: vi.fn(),
		update: vi.fn(),
	},
	session: {
		create: vi.fn(),
	},
}

vi.mock('#app/utils/db.server.ts', () => ({
	prisma: mockPrisma,
}))

// Static imports (vi.mock is hoisted, so these will use mocked versions)
import {
	checkIsCommonPassword,
	getPasswordHashParts,
	login,
	isAccountLocked,
	MAX_LOGIN_ATTEMPTS,
	LOCKOUT_DURATION_MS,
} from './auth.server.ts'

beforeEach(() => {
	vi.clearAllMocks()
})

// --- Original tests ---

test('checkIsCommonPassword returns true when password is found in breach database', async () => {
	const password = 'testpassword'
	const [prefix, suffix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/${prefix}`, () => {
			return new HttpResponse(
				`1234567890123456789012345678901234A:1\n${suffix}:1234`,
				{ status: 200 },
			)
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(true)
})

test('checkIsCommonPassword returns false when password is not found in breach database', async () => {
	const password = 'sup3r-dup3r-s3cret'
	const [prefix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/${prefix}`, () => {
			return new HttpResponse(
				'1234567890123456789012345678901234A:1\n' +
					'1234567890123456789012345678901234B:2',
				{ status: 200 },
			)
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
})

test('checkIsCommonPassword returns false when API returns 500', async () => {
	const password = 'testpassword'
	const [prefix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/${prefix}`, () => {
			return new HttpResponse(null, { status: 500 })
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
})

test('checkIsCommonPassword returns false when response has invalid format', async () => {
	const password = 'testpassword'
	const [prefix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/${prefix}`, () => {
			return new Response(null, { status: 200 })
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
})

describe('timeout handling', () => {
	test('checkIsCommonPassword times out after 1 second', async () => {
		server.use(
			http.get('https://api.pwnedpasswords.com/range/:prefix', async () => {
				const twoSecondDelay = 2000
				await new Promise((resolve) => setTimeout(resolve, twoSecondDelay))
				return new HttpResponse(
					'1234567890123456789012345678901234A:1\n' +
						'1234567890123456789012345678901234B:2',
					{ status: 200 },
				)
			}),
		)

		const result = await checkIsCommonPassword('testpassword')
		expect(result).toBe(false)
	}, 5000)
})

// --- Account lockout tests ---

describe('account lockout', () => {
	const validPassword = 'correct-horse-battery-staple'
	const wrongPassword = 'wrong-password'
	const username = 'testuser'

	describe('login() - successful path', () => {
		test('returns session on correct password and resets lockout', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: new Date(Date.now() - 1000),
				failedLoginAttempts: 3,
			})
			mockPrisma.user.update.mockResolvedValue({})
			mockPrisma.session.create.mockResolvedValue({
				id: 'session-1',
				expirationDate: new Date(),
				userId: 'user-1',
			})

			const session = await login({ username, password: validPassword })

			expect(session).not.toBeNull()
			expect(session!.id).toBe('session-1')

			expect(mockPrisma.user.update).toHaveBeenCalledWith({
				where: { username },
				data: { failedLoginAttempts: 0, lockedUntil: null },
			})
		})

		test('returns session with no lockout reset for clean account', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: null,
				failedLoginAttempts: 0,
			})
			mockPrisma.session.create.mockResolvedValue({
				id: 'session-2',
				expirationDate: new Date(),
				userId: 'user-1',
			})

			const session = await login({ username, password: validPassword })

			expect(session).not.toBeNull()
			expect(mockPrisma.user.update).not.toHaveBeenCalled()
		})
	})

	describe('login() - failed password', () => {
		test('returns null and increments failed count', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: null,
				failedLoginAttempts: 0,
			})
			mockPrisma.user.update.mockResolvedValue({})

			const session = await login({ username, password: wrongPassword })

			expect(session).toBeNull()
			expect(mockPrisma.user.update).toHaveBeenCalledWith({
				where: { username },
				data: { failedLoginAttempts: 1, lockedUntil: null },
			})
		})

		test('locks account when max attempts reached', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: null,
				failedLoginAttempts: MAX_LOGIN_ATTEMPTS - 1,
			})
			mockPrisma.user.update.mockResolvedValue({})

			const session = await login({ username, password: wrongPassword })

			expect(session).toBeNull()

			const updateCall = mockPrisma.user.update.mock.calls[0][0]
			expect(updateCall.where).toEqual({ username })
			expect(updateCall.data.failedLoginAttempts).toBe(MAX_LOGIN_ATTEMPTS)
			expect(updateCall.data.lockedUntil).toBeInstanceOf(Date)
			expect(updateCall.data.lockedUntil.getTime()).toBeGreaterThan(
				Date.now() + LOCKOUT_DURATION_MS - 5000,
			)
		})
	})

	describe('login() - locked account', () => {
		test('returns null when account is locked', async () => {
			const hash = await bcrypt.hash(validPassword, 4)
			const futureDate = new Date(Date.now() + 5 * 60 * 1000)

			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: futureDate,
				failedLoginAttempts: MAX_LOGIN_ATTEMPTS,
			})

			const session = await login({ username, password: validPassword })

			expect(session).toBeNull()
			expect(mockPrisma.user.update).not.toHaveBeenCalled()
			expect(mockPrisma.session.create).not.toHaveBeenCalled()
		})

		test('allows login after lockout expires', async () => {
			const hash = await bcrypt.hash(validPassword, 4)
			const pastDate = new Date(Date.now() - 60 * 1000)

			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: pastDate,
				failedLoginAttempts: MAX_LOGIN_ATTEMPTS,
			})
			mockPrisma.user.update.mockResolvedValue({})
			mockPrisma.session.create.mockResolvedValue({
				id: 'session-3',
				expirationDate: new Date(),
				userId: 'user-1',
			})

			const session = await login({ username, password: validPassword })

			expect(session).not.toBeNull()
			expect(mockPrisma.user.update).toHaveBeenCalledWith({
				where: { username },
				data: { failedLoginAttempts: 0, lockedUntil: null },
			})
		})
	})

	describe('login() - edge cases', () => {
		test('returns null for nonexistent user', async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null)

			const session = await login({ username: 'ghost', password: 'test' })

			expect(session).toBeNull()
			expect(mockPrisma.user.update).not.toHaveBeenCalled()
		})

		test('returns null for user with no password', async () => {
			mockPrisma.user.findUnique.mockResolvedValue({
				id: 'user-1',
				password: null,
				lockedUntil: null,
				failedLoginAttempts: 0,
			})

			const session = await login({ username, password: 'test' })

			expect(session).toBeNull()
			expect(mockPrisma.user.update).not.toHaveBeenCalled()
		})
	})

	describe('isAccountLocked()', () => {
		test('returns false for nonexistent user', async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null)

			const result = await isAccountLocked('ghost')
			expect(result).toBe(false)
		})

		test('returns false when lockedUntil is null', async () => {
			mockPrisma.user.findUnique.mockResolvedValue({ lockedUntil: null })

			const result = await isAccountLocked(username)
			expect(result).toBe(false)
		})

		test('returns false when lockedUntil is in the past', async () => {
			mockPrisma.user.findUnique.mockResolvedValue({
				lockedUntil: new Date(Date.now() - 60 * 1000),
			})

			const result = await isAccountLocked(username)
			expect(result).toBe(false)
		})

		test('returns true when lockedUntil is in the future', async () => {
			mockPrisma.user.findUnique.mockResolvedValue({
				lockedUntil: new Date(Date.now() + 60 * 1000),
			})

			const result = await isAccountLocked(username)
			expect(result).toBe(true)
		})
	})
})
