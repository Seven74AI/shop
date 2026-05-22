     1|/**
     2| * @vitest-environment node
     3| */
     4|import { describe, expect, test, beforeEach, afterEach } from 'vitest'
     5|import { prisma } from '#app/utils/db.server.ts'
     6|import { authSessionStorage } from '#app/utils/session.server.ts'
     7|import { createAdminUser } from '#tests/user-utils.ts'
     8|import { action, loader } from './$promotionId_.edit.tsx'
     9|
    10|async function createAuthenticatedRequest(
    11|	url: string,
    12|	userId: string,
    13|	method = 'GET',
    14|): Promise<Request> {
    15|	const session = await prisma.session.create({
    16|		data: {
    17|			userId,
    18|			expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    19|		},
    20|	})
    21|
    22|	const authSession = await authSessionStorage.getSession()
    23|	authSession.set('sessionId', session.id)
    24|	const cookie = await authSessionStorage.commitSession(authSession)
    25|
    26|	return new Request(url, {
    27|		method,
    28|		headers: { Cookie: cookie },
    29|	})
    30|}
    31|
    32|describe('admin promotions edit route', () => {
    33|	let adminUserId: string
    34|	let promotionId: string
    35|
    36|	beforeEach(async () => {
    37|		const { user } = await createAdminUser()
    38|		adminUserId = user.id
    39|
    40|		const promotion = await prisma.promotion.create({
    41|			data: {
    42|				name: 'Original Promo',
    43|				description: 'Original description',
    44|				discountType: 'PERCENTAGE',
    45|				discountValue: 1000,
    46|				isActive: true,
    47|			},
    48|		})
    49|		promotionId = promotion.id
    50|	})
    51|
    52|	afterEach(async () => {
    53|		await prisma.session.deleteMany({})
    54|		await prisma.promotion.deleteMany({})
    55|		await prisma.user.deleteMany({})
    56|	})
    57|
    58|	test('loader returns promotion data', async () => {
    59|		const request = await createAuthenticatedRequest(
    60|			`http://localhost:3000/admin/promotions/${promotionId}/edit`,
    61|			adminUserId,
    62|		)
    63|
    64|		const result = await loader({
    65|			request,
    66|			params: { promotionId },
    67|			context: {},
    68|			url: new URL('http://localhost'),
    69|			pattern: '',
    70|		})
    71|
    72|		expect(result).toHaveProperty('promotion')
    73|		expect(result.promotion.name).toBe('Original Promo')
    74|	})
    75|
    76|	test('action updates promotion fields', async () => {
    77|		const formData = new FormData()
    78|		formData.append('id', promotionId)
    79|		formData.append('name', 'Updated Promo')
    80|		formData.append('description', 'Updated description')
    81|		formData.append('discountType', 'FIXED_AMOUNT')
    82|		formData.append('discountValue', '2000')
    83|		formData.append('isActive', 'on')
    84|
    85|		const request = await createAuthenticatedRequest(
    86|			`http://localhost:3000/admin/promotions/${promotionId}/edit`,
    87|			adminUserId,
    88|			'POST',
    89|		)
    90|
    91|		const requestWithFormData = new Request(request.url, {
    92|			method: 'POST',
    93|			headers: request.headers,
    94|			body: formData,
    95|		})
    96|
    97|		const result = await action({
    98|		\trequest: requestWithFormData,
    99|		\tparams: { promotionId },
   100|		\tcontext: {},
   101|		\turl: new URL('http://localhost'),
   102|		\tpattern: '',
   103|		})
   104|
   105|		expect(result).toHaveProperty('headers')
   106|		if (!('headers' in result)) {
   107|		\tthrow new Error('Expected result to have headers')
   108|		}
   109|
   110|		const updated = await prisma.promotion.findUnique({
   111|			where: { id: promotionId },
   112|		})
   113|		expect(updated?.name).toBe('Updated Promo')
   114|		expect(updated?.discountType).toBe('FIXED_AMOUNT')
   115|		expect(updated?.discountValue).toBe(2000)
   116|	})
   117|
   118|	test('action can deactivate promotion', async () => {
   119|		const formData = new FormData()
   120|		formData.append('id', promotionId)
   121|		formData.append('name', 'Original Promo')
   122|		formData.append('discountType', 'PERCENTAGE')
   123|		formData.append('discountValue', '1000')
   124|		// isActive not set → false
   125|
   126|		const request = await createAuthenticatedRequest(
   127|			`http://localhost:3000/admin/promotions/${promotionId}/edit`,
   128|			adminUserId,
   129|			'POST',
   130|		)
   131|
   132|		const requestWithFormData = new Request(request.url, {
   133|			method: 'POST',
   134|			headers: request.headers,
   135|			body: formData,
   136|		})
   137|
   138|		await action({
   139|			request: requestWithFormData,
   140|			params: {},
   141|			context: {},
   142|			url: new URL('http://localhost'),
   143|			pattern: '',
   144|		})
   145|
   146|		const updated = await prisma.promotion.findUnique({
   147|			where: { id: promotionId },
   148|		})
   149|		expect(updated?.isActive).toBe(false)
   150|	})
   151|
   152|	test('loader returns 404 for non-existent promotion', async () => {
   153|		const request = await createAuthenticatedRequest(
   154|			'http://localhost:3000/admin/promotions/nonexistent/edit',
   155|			adminUserId,
   156|		)
   157|
   158|		await expect(
   159|			loader({
   160|				request,
   161|				params: { promotionId: 'nonexistent' },
   162|				context: {},
   163|				url: new URL('http://localhost'),
   164|				pattern: '',
   165|			}),
   166|		).rejects.toThrow()
   167|	})
   168|})
   169|