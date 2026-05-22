import { useForm, getFormProps, getInputProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#app/components/ui/select.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { CouponSchema, generateCouponCode } from '#app/schemas/coupon.ts'
import { type Route } from './+types/new.ts'

export async function action({ request }: Route.ActionArgs) {
  await requireUserWithRole(request, 'admin')

  const formData = await parseFormData(request)
  const submission = await parseWithZod(formData, {
    schema: CouponSchema,
  })

  if (submission.status !== 'success') {
    return {
      result: submission.reply(),
    }
  }

  const { code, discountType, discountValue, minOrderAmount, maxUses, startsAt, expiresAt, isActive } =
    submission.value

  // Check for duplicate code
  const existing = await prisma.coupon.findUnique({ where: { code } })
  if (existing) {
    return {
      result: submission.reply({
        formErrors: ['A coupon with this code already exists.'],
      }),
    }
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      discountType,
      discountValue,
      minOrderAmount: minOrderAmount ?? null,
      maxUses: maxUses ?? null,
      startsAt: startsAt ?? null,
      expiresAt: expiresAt ?? null,
      isActive,
    },
  })

  return redirectWithToast(`/admin/promotions/coupons`, {
    description: `Coupon "${coupon.code}" created successfully`,
  })
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUserWithRole(request, 'admin')
  return {}
}

export const meta: Route.MetaFunction = () => [
  { title: 'New Coupon | Admin | Epic Shop' },
  { name: 'description', content: 'Create a new discount coupon' },
]

function CouponForm({ actionData }: { actionData?: Route.ComponentProps['actionData'] }) {
  const isPending = useIsPending()

  const [form, fields] = useForm({
    id: 'coupon-form',
    constraint: getZodConstraint(CouponSchema),
    lastResult: actionData?.result,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: CouponSchema })
    },
    defaultValue: {
      code: generateCouponCode(),
      discountType: 'PERCENTAGE',
      discountValue: '1000',
      minOrderAmount: '',
      maxUses: '',
      startsAt: '',
      expiresAt: '',
      isActive: 'on',
    },
    shouldRevalidate: 'onBlur',
  })

  return (
    <FormProvider context={form.context}>
      <Form method="POST" className="space-y-8" {...getFormProps(form)}>
        <Card className="rounded-[14px]">
          <CardHeader>
            <h2 className="text-base font-normal text-foreground">Coupon Details</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <Label htmlFor={fields.code.id} className="text-sm font-medium">
                  Coupon Code *
                </Label>
                <Input
                  {...getInputProps(fields.code, { type: 'text' })}
                  placeholder="e.g., SUMMER25"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20 font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Uppercase letters, numbers, underscores, and hyphens only.
                </p>
                <ErrorList errors={fields.code.errors} />
              </div>

              <div className="space-y-3">
                <Label htmlFor={fields.discountType.id} className="text-sm font-medium">
                  Discount Type *
                </Label>
                <Select
                  name={fields.discountType.name}
                  defaultValue={form.initialValue?.discountType ?? 'PERCENTAGE'}
                >
                  <SelectTrigger
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    aria-label="Discount type"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                    <SelectItem value="FIXED_AMOUNT">Fixed Amount (€)</SelectItem>
                  </SelectContent>
                </Select>
                <ErrorList errors={fields.discountType.errors} />
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor={fields.discountValue.id} className="text-sm font-medium">
                Discount Value *
              </Label>
              <Input
                {...getInputProps(fields.discountValue, { type: 'number' })}
                placeholder="1000 = 10.00% or 10.00 EUR"
                className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-xs text-muted-foreground">
                For percentage: basis points (1000 = 10.00%). For fixed amount: cents (1000 =
                10.00 EUR).
              </p>
              <ErrorList errors={fields.discountValue.errors} />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <Label htmlFor={fields.minOrderAmount.id} className="text-sm font-medium">
                  Min Order Amount (cents)
                </Label>
                <Input
                  {...getInputProps(fields.minOrderAmount, { type: 'number' })}
                  placeholder="e.g., 5000 = 50.00 EUR"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <ErrorList errors={fields.minOrderAmount.errors} />
              </div>

              <div className="space-y-3">
                <Label htmlFor={fields.maxUses.id} className="text-sm font-medium">
                  Max Uses (empty = unlimited)
                </Label>
                <Input
                  {...getInputProps(fields.maxUses, { type: 'number' })}
                  placeholder="e.g., 100"
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <ErrorList errors={fields.maxUses.errors} />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <Label htmlFor={fields.startsAt.id} className="text-sm font-medium">
                  Start Date
                </Label>
                <Input
                  {...getInputProps(fields.startsAt, { type: 'datetime-local' })}
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <ErrorList errors={fields.startsAt.errors} />
              </div>

              <div className="space-y-3">
                <Label htmlFor={fields.expiresAt.id} className="text-sm font-medium">
                  Expiry Date
                </Label>
                <Input
                  {...getInputProps(fields.expiresAt, { type: 'datetime-local' })}
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <ErrorList errors={fields.expiresAt.errors} />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                {...getInputProps(fields.isActive, { type: 'checkbox' })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                defaultChecked={true}
              />
              <Label htmlFor={fields.isActive.id} className="text-sm font-medium cursor-pointer">
                Active (coupon is available for use)
              </Label>
            </div>
            <ErrorList errors={fields.isActive.errors} />
            {form.errors && <ErrorList errors={form.errors} />}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.history.back()}
            className="transition-all duration-200 hover:shadow-sm"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            className="transition-all duration-200 hover:shadow-md"
          >
            {isPending ? 'Creating...' : 'Create Coupon'}
          </Button>
        </div>
      </Form>
    </FormProvider>
  )
}

export default function NewCoupon({ actionData }: Route.ComponentProps) {
  return (
    <div className="space-y-8 animate-slide-top">
      <div>
        <h1 className="text-2xl font-normal tracking-tight text-foreground">
          Create New Coupon
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a discount coupon code for your customers
        </p>
      </div>

      <CouponForm actionData={actionData} />
    </div>
  )
}
