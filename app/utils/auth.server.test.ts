import bcrypt from 'bcryptjs'
import { http, HttpResponse } from 'msw'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { server } from '#tests/mocks'
import { prisma } from '#app/utils/db.server.ts'

// Mock Sentry first
vi.mock('@sentry/react-router', async () => {
	const actual = await vi.importActual('@sentry/react-router')
	return {
		...actual,
		captureException: vi.fn(),
		captureMessage: vi.fn(),
	}
})

// Spy on prisma methods for lockout tests
const userFindUnique = vi.spyOn(prisma.user, 'findUnique')
const userUpdate = vi.spyOn(prisma.user, 'update')
const sessionCreate = vi.spyOn(prisma.session, 'create')

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
		http.get(`https://api.pwnedpasswords.com/range/:prefix`, () => {
			const body = suffix.toUpperCase() + ':42'
			return new HttpResponse(body, {
				status: 200,
				headers: { 'Content-Type': 'text/plain' },
			})
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(true)
})

test('checkIsCommonPassword returns false when password is not found in breach database', async () => {
	const password = 'uniquepassword123'
	const [prefix] = getPasswordHashParts(password)

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/:prefix`, () => {
			return new HttpResponse('', {
				status: 200,
				headers: { 'Content-Type': 'text/plain' },
			})
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
})

test('checkIsCommonPassword returns false when API returns 500', async () => {
	const password = 'testpassword'

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/:prefix`, () => {
			return new HttpResponse('Internal Server Error', { status: 500 })
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
})

test('checkIsCommonPassword returns false when response has invalid format', async () => {
	const password = 'testpassword'

	server.use(
		http.get(`https://api.pwnedpasswords.com/range/:prefix`, () => {
			return new HttpResponse('invalid-data', {
				status: 200,
				headers: { 'Content-Type': 'text/plain' },
			})
		}),
	)

	const result = await checkIsCommonPassword(password)
	expect(result).toBe(false)
})

describe('timeout handling', () => {
	test('checkIsCommonPassword times out after 1 second', async () => {
		const password = 'testpassword'

		server.use(
			http.get(`https://api.pwnedpasswords.com/range/:prefix`, async () => {
				await new Promise((resolve) => setTimeout(resolve, 2000))
				return new HttpResponse('', { status: 200 })
			}),
		)

		const result = await checkIsCommonPassword(password)
		expect(result).toBe(false)
	})
})

// --- Account lockout tests ---

const username = 'testuser'
const validPassword = 'correct-password'
const wrongPassword = 'wrong-password'

describe('account lockout', () => {
	describe('isAccountLocked()', () => {
		test('returns false when user has no lockout', async () => {
			userFindUnique.mockResolvedValue({
				id: 'user-1',
				lockedUntil: null,
			} as any)

			const result = await isAccountLocked(username)
			expect(result).toBe(false)
		})

		test('returns false when lockedUntil is in the past', async () => {
			const pastDate = new Date(Date.now() - 60 * 1000)
			userFindUnique.mockResolvedValue({
				id: 'user-1',
				lockedUntil: pastDate,
			} as any)

			const result = await isAccountLocked(username)
			expect(result).toBe(false)
		})

		test('returns true when lockedUntil is in the future', async () => {
			const futureDate = new Date(Date.now() + 5 * 60 * 1000)
			userFindUnique.mockResolvedValue({
				id: 'user-1',
				lockedUntil: futureDate,
			} as any)

			const result = await isAccountLocked(username)
			expect(result).toBe(true)
		})
	})

	describe('login() - successful path', () => {
		test('returns session on correct password and resets lockout', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			userFindUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: null,
				failedLoginAttempts: 3,
			} as any)
			userUpdate.mockResolvedValue({} as any)
			sessionCreate.mockResolvedValue({
				id: 'session-1',
				expirationDate: new Date(),
				userId: 'user-1',
			} as any)

			const session = await login({ username, password: validPassword })

			expect(session).not.toBeNull()
			expect(userUpdate).toHaveBeenCalledWith({
				where: { username },
				data: { failedLoginAttempts: 0, lockedUntil: null },
			})
		})

		test('returns session with no lockout reset for clean account', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			userFindUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: null,
				failedLoginAttempts: 0,
			} as any)
			sessionCreate.mockResolvedValue({
				id: 'session-2',
				expirationDate: new Date(),
				userId: 'user-1',
			} as any)

			const session = await login({ username, password: validPassword })

			expect(session).not.toBeNull()
			expect(userUpdate).not.toHaveBeenCalled()
		})
	})

	describe('login() - failed password', () => {
		test('returns null and increments failed count', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			userFindUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: null,
				failedLoginAttempts: 0,
			} as any)
			userUpdate.mockResolvedValue({} as any)

			const session = await login({ username, password: wrongPassword })

			expect(session).toBeNull()
			expect(userUpdate).toHaveBeenCalledWith({
				where: { username },
				data: { failedLoginAttempts: 1, lockedUntil: null },
			})
		})

		test('locks account when max attempts reached', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			userFindUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: null,
				failedLoginAttempts: MAX_LOGIN_ATTEMPTS - 1,
			} as any)
			userUpdate.mockResolvedValue({} as any)

			const session = await login({ username, password: wrongPassword })

			expect(session).toBeNull()

			const updateCall = userUpdate.mock.calls[0]![0]
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

			userFindUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: futureDate,
				failedLoginAttempts: MAX_LOGIN_ATTEMPTS,
			} as any)

			const session = await login({ username, password: validPassword })

			expect(session).toBeNull()
			expect(userUpdate).not.toHaveBeenCalled()
			expect(sessionCreate).not.toHaveBeenCalled()
		})

		test('allows login after lockout expires', async () => {
			const hash = await bcrypt.hash(validPassword, 4)
			const pastDate = new Date(Date.now() - 60 * 1000)

			userFindUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: pastDate,
				failedLoginAttempts: MAX_LOGIN_ATTEMPTS,
			} as any)
			userUpdate.mockResolvedValue({} as any)
			sessionCreate.mockResolvedValue({
				id: 'session-3',
				expirationDate: new Date(),
				userId: 'user-1',
			} as any)

			const session = await login({ username, password: validPassword })

			expect(session).not.toBeNull()
			expect(userUpdate).toHaveBeenCalledWith({
				where: { username },
				data: { failedLoginAttempts: 0, lockedUntil: null },
			})
		})
	})

	describe('login() - edge cases', () => {
		test('returns null for nonexistent user', async () => {
			userFindUnique.mockResolvedValue(null)

			const session = await login({ username, password: validPassword })

			expect(session).toBeNull()
			expect(userUpdate).not.toHaveBeenCalled()
		})

		test('returns null for user without password', async () => {
			userFindUnique.mockResolvedValue({
				id: 'user-1',
				password: null,
			} as any)

			const session = await login({ username, password: validPassword })

			expect(session).toBeNull()
			expect(userUpdate).not.toHaveBeenCalled()
		})

		test('increments counter without locking at max-1 attempts', async () => {
			const hash = await bcrypt.hash(validPassword, 4)

			userFindUnique.mockResolvedValue({
				id: 'user-1',
				password: { hash },
				lockedUntil: null,
				failedLoginAttempts: MAX_LOGIN_ATTEMPTS - 2,
			} as any)
			userUpdate.mockResolvedValue({} as any)

			const session = await login({ username, password: wrongPassword })

			expect(session).toBeNull()
			expect(userUpdate).toHaveBeenCalledWith({
				where: { username },
				data: {
					failedLoginAttempts: MAX_LOGIN_ATTEMPTS - 1,
					lockedUntil: null,
				},
			})
		})

		test('does not leak lockout info for nonexistent user', async () => {
			userFindUnique.mockResolvedValue(null)

			const locked = await isAccountLocked('nonexistent')
			expect(locked).toBe(false)
		})
	})
})
