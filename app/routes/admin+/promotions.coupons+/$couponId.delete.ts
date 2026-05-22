import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$couponId.delete.ts'

const DeleteCouponSchema = z.object({
  couponId: z.string().min(1),
})

export async function action({ params, request }: Route.ActionArgs) {
  await requireUserWithRole(request, 'admin')

  const formData = await request.formData()
  const submission = parseWithZod(formData, { schema: DeleteCouponSchema })

  if (submission.status !== 'success') {
    return data({ result: submission.reply() }, { status: 400 })
  }

  const coupon = await prisma.coupon.findUnique({
    where: { id: params.couponId },
  })

  invariantResponse(coupon, 'Coupon not found', { status: 404 })

  await prisma.coupon.delete({ where: { id: coupon.id } })

  return redirectWithToast('/admin/promotions/coupons', {
    description: `Coupon "${coupon.code}" deleted.`,
  })
}
