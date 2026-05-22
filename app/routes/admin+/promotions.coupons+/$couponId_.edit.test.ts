     1|/**
     2| * @vitest-environment node
     3| */
     4|import { describe, expect, test, beforeEach, afterEach } from 'vitest'
     5|import { prisma } from '#app/utils/db.server.ts'
     6|import { authSessionStorage } from '#app/utils/session.server.ts'
     7|import { createAdminUser } from '#tests/user-utils.ts'
     8|import { action, loader } from './$couponId_.edit.tsx'
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
    32|describe('admin coupons edit route', () => {
    33|	let adminUserId: string
    34|	let couponId: string
    35|
    36|	beforeEach(async () => {
    37|		const { user } = await createAdminUser()
    38|		adminUserId = user.id
    39|
    40|		const coupon = await prisma.coupon.create({
    41|			data: {
    42|				code: 'WELCOME10',
    43|				discountType: 'PERCENTAGE',
    44|				discountValue: 1000,
    45|				isActive: true,
    46|			},
    47|		})
    48|		couponId = coupon.id
    49|	})
    50|
    51|	afterEach(async () => {
    52|		await prisma.session.deleteMany({})
    53|		await prisma.coupon.deleteMany({})
    54|		await prisma.user.deleteMany({})
    55|	})
    56|
    57|	test('loader returns coupon data', async () => {
    58|		const request = await createAuthenticatedRequest(
    59|			`http://localhost:3000/admin/promotions/coupons/${couponId}/edit`,
    60|			adminUserId,
    61|		)
    62|
    63|		const result = await loader({
    64|			request,
    65|			params: { couponId },
    66|			context: {},
    67|			url: new URL('http://localhost'),
    68|			pattern: '',
    69|		})
    70|
    71|		expect(result).toHaveProperty('coupon')
    72|		expect(result.coupon.code).toBe('WELCOME10')
    73|	})
    74|
    75|	test('action updates coupon fields', async () => {
    76|		const formData = new FormData()
    77|		formData.append('id', couponId)
    78|		formData.append('code', 'WELCOME20')
    79|		formData.append('discountType', 'PERCENTAGE')
    80|		formData.append('discountValue', '2000')
    81|		formData.append('isActive', 'on')
    82|
    83|		const request = await createAuthenticatedRequest(
    84|			`http://localhost:3000/admin/promotions/coupons/${couponId}/edit`,
    85|			adminUserId,
    86|			'POST',
    87|		)
    88|
    89|		const requestWithFormData = new Request(request.url, {
    90|			method: 'POST',
    91|			headers: request.headers,
    92|			body: formData,
    93|		})
    94|
    95|		const result = await action({
    96|			request: requestWithFormData,
    97|			params: {},
    98|			context: {},
    99|			url: new URL('http://localhost'),
   100|			pattern: '',
   101|		})
   102|
   103|		expect(result).toHaveProperty('headers')
   104|		if (!('headers' in result)) {
   105|			throw new Error('Expected result to have headers')
   106|		}
   107|
   108|		const updated = await prisma.coupon.findUnique({
   109|			where: { id: couponId },
   110|		})
   111|		expect(updated?.code).toBe('WELCOME20')
   112|		expect(updated?.discountValue).toBe(2000)
   113|	})
   114|
   115|	test('action rejects code that conflicts with another coupon', async () => {
   116|		// Create another coupon
   117|		await prisma.coupon.create({
   118|			data: {
   119|				code: 'HOLIDAY',
   120|				discountType: 'FIXED_AMOUNT',
   121|				discountValue: 500,
   122|				isActive: true,
   123|			},
   124|		})
   125|
   126|		const formData = new FormData()
   127|		formData.append('id', couponId)
   128|		formData.append('code', 'HOLIDAY') // conflicts with other coupon
   129|		formData.append('discountType', 'PERCENTAGE')
   130|		formData.append('discountValue', '1000')
   131|		formData.append('isActive', 'on')
   132|
   133|		const request = await createAuthenticatedRequest(
   134|			`http://localhost:3000/admin/promotions/coupons/${couponId}/edit`,
   135|			adminUserId,
   136|			'POST',
   137|		)
   138|
   139|		const requestWithFormData = new Request(request.url, {
   140|			method: 'POST',
   141|			headers: request.headers,
   142|			body: formData,
   143|		})
   144|
   145|		const result = await action({
   146|			request: requestWithFormData,
   147|			params: {},
   148|			context: {},
   149|			url: new URL('http://localhost'),
   150|			pattern: '',
   151|		})
   152|
   153|		expect(result).toHaveProperty('result')
   154|		if (!('result' in result)) {
   155|			throw new Error('Expected result to have result property')
   156|		}
   157|		expect(result.result?.status).toBe('error')
   158|	})
   159|
   160|	test('action allows keeping the same code', async () => {
   161|		const formData = new FormData()
   162|		formData.append('id', couponId)
   163|		formData.append('code', 'WELCOME10') // same code — should work
   164|		formData.append('discountType', 'FIXED_AMOUNT')
   165|		formData.append('discountValue', '1500')
   166|		formData.append('isActive', 'on')
   167|
   168|		const request = await createAuthenticatedRequest(
   169|			`http://localhost:3000/admin/promotions/coupons/${couponId}/edit`,
   170|			adminUserId,
   171|			'POST',
   172|		)
   173|
   174|		const requestWithFormData = new Request(request.url, {
   175|			method: 'POST',
   176|			headers: request.headers,
   177|			body: formData,
   178|		})
   179|
   180|		await action({
   181|			request: requestWithFormData,
   182|			params: {},
   183|			context: {},
   184|			url: new URL('http://localhost'),
   185|			pattern: '',
   186|		})
   187|
   188|		const updated = await prisma.coupon.findUnique({
   189|			where: { id: couponId },
   190|		})
   191|		expect(updated?.code).toBe('WELCOME10')
   192|		expect(updated?.discountType).toBe('FIXED_AMOUNT')
   193|	})
   194|
   195|	test('action can deactivate coupon', async () => {
   196|		const formData = new FormData()
   197|		formData.append('id', couponId)
   198|		formData.append('code', 'WELCOME10')
   199|		formData.append('discountType', 'PERCENTAGE')
   200|		formData.append('discountValue', '1000')
   201|		// isActive not set → false
   202|
   203|		const request = await createAuthenticatedRequest(
   204|			`http://localhost:3000/admin/promotions/coupons/${couponId}/edit`,
   205|			adminUserId,
   206|			'POST',
   207|		)
   208|
   209|		const requestWithFormData = new Request(request.url, {
   210|			method: 'POST',
   211|			headers: request.headers,
   212|			body: formData,
   213|		})
   214|
   215|		await action({
   216|			request: requestWithFormData,
   217|			params: {},
   218|			context: {},
   219|			url: new URL('http://localhost'),
   220|			pattern: '',
   221|		})
   222|
   223|		const updated = await prisma.coupon.findUnique({
   224|			where: { id: couponId },
   225|		})
   226|		expect(updated?.isActive).toBe(false)
   227|	})
   228|})
   229|