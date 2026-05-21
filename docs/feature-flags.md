# Feature Flags System

Epic Shop's feature flag infrastructure enables progressive rollouts, A/B testing, and operational kill switches.

## Architecture

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Flag Model** | `prisma/schema.prisma` (Flag) | Database schema: key, enabled, rollout%, audience, description |
| **Flag Schema** | `app/schemas/flag.ts` | Zod validation schemas for flag data and audience JSON |
| **Engine** | `app/utils/flag.server.ts` | Core logic: `isFlagEnabled()`, rollout hash, audience matching, cache |
| **Middleware** | `app/utils/feature-flags.server.ts` | Express middleware: `requireFlag()` for route gating |
| **Admin UI** | `app/routes/admin+/feature-flags+/` | CRUD panel: list, create, edit, toggle, delete |

### Database Model

```prisma
model Flag {
  key               String   @id
  enabled           Boolean  @default(false)
  rolloutPercentage Int?     @default(0)
  audience          String?  // JSON: {"userIds":["..."], "countries":["FR","BE"], "roles":["admin"]}
  description       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

`audience` is stored as a JSON string (`TEXT`) for SQLite compatibility. It is validated on read/write using `FlagAudienceSchema` (Zod).

## Path to Green

A flag evaluates to `true` following this decision order:

1. **Flag not in DB** → `false`
2. **`enabled` is `false`** → `false`
3. **Audience match** → if audience JSON is set AND the request context (`userId`, `country`, `roles`) matches → `true`
4. **Rollout percentage** → if `rolloutPercentage` is 1–99 AND `userId` is provided → deterministic hash-based gate
5. **Default** → `true` (enabled with no constraints)

### Decision flow diagram

```
isFlagEnabled(key, ctx?)
  ├─ Flag not found? → false
  ├─ !enabled?       → false
  ├─ Audience match?  → true
  ├─ Rollout applies?  → isInRollout(key, userId, percentage)
  └─ Default           → true
```

## Rollout Hash

Rollout uses `sha256(flagKey + userId)`, taking the first 4 bytes as a 32-bit unsigned integer modulo 100. This ensures:

- **Deterministic**: same `(flag, user)` always maps to the same bucket
- **Uniform**: ~uniform distribution across 0–99
- **Independent**: different flags produce different distributions for the same user

```
isInRollout(key, userId, 30%)
  → user is in bucket 0–29 (30% chance)
```

## Audience Targeting

Audience JSON supports three filter dimensions, any of which can grant access:

```json
{
  "userIds": ["user_abc", "user_def"],
  "countries": ["FR", "BE", "CH"],
  "roles": ["admin", "beta"]
}
```

- At least one dimension must match for access
- If no audience is set, ALL users pass the audience check
- Invalid JSON → fail-closed (returns `false`)

## Cache

Flags are cached in-memory for **30 seconds** using `@epic-web/remember`. Cache is invalidated after every mutation (create, update, delete, toggle). Call `invalidateFlagCache()` after direct DB mutations outside the admin UI.

## Usage

### Checking a flag (server-side)

```typescript
import { isFlagEnabled } from '#app/utils/flag.server.ts'

if (await isFlagEnabled('new_checkout_flow', { userId: user.id })) {
  // Show new checkout
}
```

### Route gating (middleware)

```typescript
import { requireFlag } from '#app/utils/feature-flags.server.ts'

app.get(
  '/experimental/route',
  requireFlag('experimental_feature'),
  handler
)
```

The middleware returns **404** when the flag is not enabled, making the route invisible rather than returning 403/401.

### Admin panel

Accessible at `/admin/feature-flags` (requires `admin` role).

- **List**: search by key/description, filter by enabled/disabled/all
- **Create**: key (alphanumeric + `_` `-`), enabled, rollout%, audience JSON, description
- **Edit**: all fields except key (immutable after creation)
- **Toggle**: quick enable/disable from the list row
- **Delete**: confirmation dialog; deleted flags immediately expose gated routes

## Testing

- **Unit tests**: `app/utils/flag.server.test.ts` — 15 tests covering isFlagEnabled (9), rollout hash (4), cache invalidation (1)
- **Route tests**: `app/routes/admin+/feature-flags+/index.test.ts` (1), `new.test.ts` (4)
- **E2E tests**: `tests/e2e/feature-flags.test.ts` — 14 tests covering admin access, CRUD operations, search/filter, accessibility

Run full test suite:
```bash
pnpm vitest run && pnpm playwright test --workers=1
```

## Security Considerations

- **Admin-only**: all routes require `admin` role via `requireUserWithRole`
- **Audience validation**: corrupt JSON → fail-closed (returns false)
- **404 gating**: `requireFlag()` returns 404, not 403 — hides endpoint existence
- **Immutable keys**: flag keys cannot be changed after creation (prevents accidental re-targeting)
- **Cache TTL**: 30-second cache prevents repeated DB queries on high-traffic routes
