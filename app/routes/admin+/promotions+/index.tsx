import { Link } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#app/components/ui/table.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
  await requireUserWithRole(request, 'admin')

  const [promotions, couponCount] = await Promise.all([
    prisma.promotion.findMany({
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.coupon.count(),
  ])

  return { promotions, couponCount }
}

export const meta: Route.MetaFunction = () => [
  { title: 'Promotions | Admin | Epic Shop' },
  { name: 'description', content: 'Manage promotions and discount coupons' },
]

function formatDiscount(
  promo: Route.ComponentProps['loaderData']['promotions'][number],
): string {
  if (promo.discountType === 'PERCENTAGE') {
    return `${(promo.discountValue / 100).toFixed(2)}%`
  }
  return `€${(promo.discountValue / 100).toFixed(2)}`
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function PromotionsDashboard({
  loaderData,
}: Route.ComponentProps) {
  const { promotions, couponCount } = loaderData

  return (
    <div className="space-y-8 animate-slide-top">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal tracking-tight text-foreground">
            Promotions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage promotions and discount coupons
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild className="h-9 rounded-lg font-medium">
            <Link to="/admin/promotions/new">
              <Icon name="plus" className="mr-2 h-4 w-4" />
              New Promotion
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-9 rounded-lg font-medium">
            <Link to="/admin/promotions/coupons/new">
              <Icon name="plus" className="mr-2 h-4 w-4" />
              New Coupon
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick links cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-[14px]">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Icon name="tags" className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-normal text-foreground">
                  Discount Coupons
                </h2>
                <p className="text-sm text-muted-foreground">
                  {couponCount} coupon{couponCount === 1 ? '' : 's'} configured
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Button asChild className="w-full h-9 rounded-lg font-medium">
                <Link to="/admin/promotions/coupons">
                  Manage Coupons
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[14px]">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Icon name="bell" className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-normal text-foreground">
                  Promotions
                </h2>
                <p className="text-sm text-muted-foreground">
                  {promotions.length} promotion{promotions.length === 1 ? '' : 's'} configured
                </p>
              </div>
            </div>
            <div className="mt-4">
              <Button asChild variant="outline" className="w-full h-9 rounded-lg font-medium">
                <Link to="/admin/promotions/new">
                  Create Promotion
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Promotions table */}
      <div>
        <h2 className="text-lg font-normal text-foreground mb-4">
          Active Promotions
        </h2>
        <Card className="rounded-[14px]">
          <Table>
            <TableHeader>
              <TableRow className="border-b">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold hidden md:table-cell">
                  Discount
                </TableHead>
                <TableHead className="font-semibold hidden lg:table-cell">
                  Starts
                </TableHead>
                <TableHead className="font-semibold hidden lg:table-cell">
                  Expires
                </TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promotions.map((promo) => {
                const isExpired =
                  promo.expiresAt && new Date(promo.expiresAt) < new Date()
                const isNotStarted =
                  promo.startsAt && new Date(promo.startsAt) > new Date()

                return (
                  <TableRow
                    key={promo.id}
                    className="transition-colors duration-150 hover:bg-muted/50"
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{promo.name}</div>
                        {promo.description && (
                          <div className="text-sm text-muted-foreground truncate max-w-[300px]">
                            {promo.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="default" className="text-xs">
                        {promo.discountType === 'PERCENTAGE' ? '%' : '€'}{' '}
                        {formatDiscount(promo)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatDate(promo.startsAt)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatDate(promo.expiresAt)}
                    </TableCell>
                    <TableCell>
                      {!promo.isActive ? (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      ) : isExpired ? (
                        <Badge variant="destructive" className="text-xs">
                          Expired
                        </Badge>
                      ) : isNotStarted ? (
                        <Badge variant="outline" className="text-xs">
                          Scheduled
                        </Badge>
                      ) : (
                        <Badge
                          variant="default"
                          className="text-xs bg-green-100 text-green-800"
                        >
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                        >
                          <Link
                            to={`/admin/promotions/${promo.id}/edit`}
                            aria-label={`Edit ${promo.name}`}
                          >
                            <Icon
                              name="pencil-1"
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>

        {promotions.length === 0 && (
          <div className="text-center py-16 animate-slide-top">
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
              <Icon name="bell" className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No promotions yet</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Create your first promotion to offer automatic discounts to your
              customers.
            </p>
            <Button asChild size="lg" className="h-9 rounded-lg font-medium">
              <Link to="/admin/promotions/new">
                <Icon name="plus" className="mr-2 h-4 w-4" />
                Create Promotion
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
