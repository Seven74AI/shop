# Multi-Region Read Replica Setup — Runbook

> **Status:** UNVERIFIED  
> **Last verified:** Pending staging smoke test (P2.5)  
> **Trigger condition:** P5.1 (traffic threshold met)  
> **Owner:** Platform / Infra team  
> **Target runtime:** < 30 minutes for first region, < 10 per additional region  

## Overview

This runbook documents the step-by-step process to add a Fly.io read-replica region to the Shop application. When traffic justifies it, LiteFS supports multi-region read replicas — this runbook ensures the rollout is practiced and documented so it is never a research project under pressure.

### Architecture (tl;dr)

```
                    ┌──────────────────────────┐
                    │     Fly.io Consul         │
                    │  (lease coordinator)      │
                    └──────┬──────────┬─────────┘
                           │          │
              ┌────────────▼──┐   ┌───▼─────────────┐
              │  Primary (cdg)│   │  Replica (lhr)   │
              │  LiteFS RW    │◄──│  LiteFS RO       │
              │  App :8081    │   │  App :8081       │
              └───────────────┘   └──────────────────┘
                     │                      │
                     │   LiteFS FUSE +      │
                     │   async replication  │
                     └──────────────────────┘
```

- **Primary** wins the Consul lease, handles all writes
- **Replicas** mount the SQLite database read-only via LiteFS FUSE
- **LiteFS proxy** (port 8080 → 8081) intercepts requests and forwards writes to primary
- **`litefs-js` middleware** (`ensurePrimary()`) redirects mutation requests (POST/PUT/DELETE/PATCH) to the primary at the application layer
- **`getInstanceInfo()`** exposes instance identity to every request for cache routing and health endpoints

### When to use this runbook

- P5.1 trigger condition is met (sustained traffic above threshold in customer regions)
- New geo market expansion (e.g., adding a region to serve a new country cluster)
- Disaster recovery planning — you want to test multi-region before you need it

### When NOT to add a region

- **Under 1,000 sustained requests/minute.** LiteFS overhead + Consul heartbeat traffic adds ~5-10% latency per replica for the FUSE layer. One well-sized region is simpler and faster.
- **Write-heavy workload with < 100ms SLAs on writes.** `ensurePrimary()` adds a cross-region redirect hop (50-200ms) for every write from a replica region.
- **Cost-sensitive pre-revenue project.** Each additional Fly.io region costs ~$5-10/mo for a small VM.

---

## Pre-Flight Checklist

Before adding a region, confirm these are in place:

| # | Item | How to verify | Must be true? |
|---|------|---------------|---------------|
| 1 | **LiteFS is running** in the current region | `fly ssh console -a shop-3ecf --command "litefs export -name sqlite.db /tmp/test.db"` | Yes |
| 2 | **Consul lease is healthy** | `fly checks list -a shop-3ecf` — `/litefs/health` returns 200 | Yes |
| 3 | **`PRIMARY_REGION` env var set** | `fly secrets list -a shop-3ecf` | Yes |
| 4 | **`FLY_CONSUL_URL` is populated** | Auto-set by Fly.io — verify via `fly ssh console -a shop-3ecf --command "echo \$FLY_CONSUL_URL"` | Yes |
| 5 | **Current fly.toml has single region** | `grep primary_region fly.toml` shows one region | Yes |
| 6 | **Staging environment exists** (P2.5) | `fly status -a shop-3ecf-staging` | For smoke test only |
| 7 | **Rollback tested** | Run the rollback section below in staging first | For production |

If any "Yes" item fails **stop here** and fix it before proceeding.

### LiteFS Health Check Reference

The LiteFS health endpoint is defined in `fly.toml`:

```toml
[[services.http_checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  timeout = "5s"
  path = "/litefs/health"
```

This endpoint is served directly by the `litefs` binary (not the app). A 200 response means LiteFS is mounted and responding. Check it:

```bash
fly ssh console -a shop-3ecf -s "$(fly status -a shop-3ecf --json | jq -r '.Machines[0].id')" \
  --command "curl -s http://localhost:8080/litefs/health"
```

Expected: `OK` (plain text) with HTTP 200.

---

## Step 1 — Choose Regions

Choose regions based on **customer geography**, not infrastructure convenience. For an e-commerce app serving Europe:

| Region | Fly.io code | Serves | Latency to CDG (primary) | Recommended? |
|--------|-------------|--------|--------------------------|--------------|
| Paris (primary) | `cdg` | France, Iberia, North Africa | 0ms | Already deployed |
| London | `lhr` | UK, Ireland, Nordics | ~8ms | **Recommended first replica** |
| Frankfurt | `fra` | Germany, Central/Eastern Europe | ~10ms | Good second replica |
| Amsterdam | `ams` | Netherlands, Belgium, Scandinavia | ~8ms | Alternative to lhr |
| Madrid | `mad` | Spain, Portugal, Latin America | ~15ms | If Iberia traffic dominates |

**Decision rule**: Start with **lhr** (London) as the first replica — lowest latency to the primary, covers UK/Nordics, and adds geographic diversity. Add **fra** (Frankfurt) second if Central European traffic warrants it.

**Maximum practical regions**: 2-3 for e-commerce. Beyond 3, the Consul lease management overhead and cross-region write redirect latency outweigh read benefits. LiteFS is not designed for global-scale multi-master — for 5+ regions, evaluate Turso (managed libsql) or a traditional client-server DB.

### Customer Geography Data

To make a data-driven decision, check current traffic distribution:

```bash
# From Fly.io metrics (if Fly Metrics is enabled)
fly metrics -a shop-3ecf --region cdg --duration 7d

# Or from app-level analytics (if tracked)
# Check your analytics platform for geo distribution
```

---

## Step 2 — Add Region to fly.toml

### 2.1 Update the multi-region configuration

Fly.io does not use a `regions` array in `fly.toml` for multi-region. Instead, you use `fly scale count` and `fly regions` commands. However, document the change in `fly.toml` for infrastructure-as-code tracking:

```toml
# fly.toml — add comment documenting regions
app = "shop-3ecf"
primary_region = "cdg"  # Paris — primary (write-heavy, central EU)
# Additional regions (added via `fly regions add`):
#   lhr — London (read replica, UK/Nordics) — added YYYY-MM-DD
#   fra — Frankfurt (read replica, DACH/CEE) — added YYYY-MM-DD
```

Note: The `primary_region` field does NOT change — it stays as `cdg` (Paris). This field tells Fly.io where to prefer scheduling the primary machine; it does not constrain where replicas can run.

### 2.2 Add the region via fly CLI

```bash
# Add London as a read replica region
fly regions add lhr -a shop-3ecf

# Verify the region was added
fly regions list -a shop-3ecf
# Expected output:
# Region Pool:
# cdg
# lhr
# Backups: (none)

# Scale to 2 machines (1 per region)
fly scale count 2 -a shop-3ecf
```

**What this does:** Fly.io creates a second VM in `lhr` running the same Docker image. The LiteFS binary inside each VM discovers the other via Consul. The `lhr` instance sees that it is not in `cdg` (the `PRIMARY_REGION` from `litefs.yml`), so it does NOT attempt to become the primary. It mounts the database as a read-only replica.

### 2.3 Confirm the new machine is running

```bash
fly status -a shop-3ecf
```

Expected: 2 machines, one in cdg, one in lhr, both `started`.

```bash
fly machines list -a shop-3ecf
```

Note the machine IDs for the next steps.

---

## Step 3 — Confirm LiteFS Consul Lease + Read Routing

LiteFS handles multi-region **automatically** — no code changes needed. The existing `litefs.yml` already declares:

```yaml
lease:
  type: 'consul'
  candidate: ${FLY_REGION == PRIMARY_REGION}
  promote: true
  advertise-url: 'http://${HOSTNAME}.vm.${FLY_APP_NAME}.internal:20202'
```

When the new VM boots in `lhr`:
1. LiteFS starts, connects to Consul at `FLY_CONSUL_URL`
2. It evaluates `candidate`: `lhr == cdg` → `false` → does NOT attempt to become primary
3. It advertises itself to the cluster, connects to the existing primary in `cdg`
4. The primary streams the SQLite WAL to the replica via LiteFS's internal replication protocol
5. The replica mounts the database as read-only via FUSE

### Verification

```bash
# Check the primary instance
fly ssh console -a shop-3ecf -s <cdg-machine-id> \
  --command "curl -s http://localhost:20202/debug/vars" | jq '{isPrimary: .IsPrimary, dbSize: .DBSize}'

# Check the replica instance
fly ssh console -a shop-3ecf -s <lhr-machine-id> \
  --command "curl -s http://localhost:20202/debug/vars" | jq '{isPrimary: .IsPrimary, dbSize: .DBSize}'
```

Expected:
- `cdg`: `isPrimary: true`, `dbSize` matches current database
- `lhr`: `isPrimary: false`, `dbSize` close to primary (initial sync may take a few seconds)

### Headers verification

Every HTTP response from the app includes LiteFS instance headers (set by `entry.server.tsx`):

```bash
curl -sI https://shop-3ecf.fly.dev/ | grep fly-
# fly-region: cdg (or lhr, depending on which instance serves the request)
# fly-app: shop-3ecf
# fly-primary-instance: <cdg-instance-id>
# fly-instance: <serving-instance-id>
```

These headers are also set on data requests (`handleDataRequest`). Use them to verify which region served a request in production.

---

## Step 4 — Verify Write-Through Forwarding

### How it works

The application uses `ensurePrimary()` from `litefs-js` (re-exported from `app/utils/litefs.server.ts`) in mutation loaders to guarantee writes land on the primary:

```typescript
// Example: app/routes/_auth+/auth.$provider.callback.ts
export async function loader({ request }: Route.LoaderArgs) {
  // this loader performs mutations, so we need to make sure we're on the
  // primary instance to avoid writing to a read-only replica
  await ensurePrimary()
  // ... writes happen here safely
}
```

`ensurePrimary()` works as follows:
1. Calls `getInstanceInfo()` to check if this instance is the primary
2. If YES → returns immediately (no redirect needed, we are the primary)
3. If NO → throws a **redirect Response** pointing to the **primary instance URL**
4. The browser/client follows the redirect and retries the request on the primary

**Important:** `ensurePrimary()` only works for **browser-initiated** requests (loaders/actions accessed via `<form>`, `<Link>`, or direct navigation). It does NOT work for `fetch()` calls from server-side code — those would need explicit `primaryInstance` routing.

### Critical routes that already use ensurePrimary

Searching the codebase for `ensurePrimary` calls:

| Route | Why it writes | LiteFS-safe? |
|-------|---------------|--------------|
| `_auth+/auth.$provider.callback.ts` | Creates session, user, connection records | Yes — `await ensurePrimary()` on line 35 |
| (any new mutation route) | — | Must add `await ensurePrimary()` |

### Read-only routes on replicas

Routes that only perform GET/HEAD requests are **automatically served by replicas** with no code changes. The LiteFS FUSE layer handles read access transparently:

- Product listing pages
- Product detail pages
- Search results
- Static pages (about, contact, legal)
- Admin read-only dashboards

### Write routing for server-to-server calls

The cache layer (`app/utils/cache.server.ts`) already handles primary-awareness:

```typescript
async set(key, entry) {
  const { currentIsPrimary } = await getInstanceInfo()
  if (currentIsPrimary) {
    setStatement.run(key, value, JSON.stringify(entry.metadata))
  } else {
    // fire-and-forget cache update (commented out: delegates to primary)
  }
}
```

Currently, cache writes on replicas are **silently dropped** (fire-and-forget commented out). For production multi-region:
1. Uncomment the `updatePrimaryCacheValue` delegation
2. Implement the `/admin/cache/sqlite` endpoint on the primary to accept forwarded cache writes
3. Or accept eventual consistency on cache (acceptable for most cache use cases)

### Verification

```bash
# Test 1: Write from replica region should redirect to primary
# (Run from a machine NOT in the primary region)
curl -v -X POST https://shop-3ecf.fly.dev/login \
  -d "email=test@example.com" \
  -d "password=test" 2>&1 | grep -i location
# Should redirect to https://<primary-instance>.fly.dev/login

# Test 2: Read from replica region should succeed directly
curl -s https://shop-3ecf.fly.dev/products | head -20
# Should return product listing HTML from the replica
```

---

## Step 5 — Verify Replication Lag

### What to expect

LiteFS uses **asynchronous replication** via SQLite WAL streaming. In normal operation:

| Metric | Expected value | Notes |
|--------|---------------|-------|
| **Replication lag** | < 100ms (p50), < 500ms (p99) | Measured as WAL position delta |
| **Write throughput ceiling** | ~100 transactions/second | LiteFS documented limit; beyond this, consider write sharding |
| **Initial sync time** | ~30s per GB of data | Occurs only on first boot of a new replica |
| **Failover window** | 5-15 seconds | If primary dies, Consul lease times out before replica promotes |

### Check replication lag

```bash
# On the primary
fly ssh console -a shop-3ecf -s <cdg-machine-id> \
  --command "litefs export -name sqlite.db /tmp/db-primary.db && wc -c /tmp/db-primary.db"

# On the replica (immediately after)
fly ssh console -a shop-3ecf -s <lhr-machine-id> \
  --command "litefs export -name sqlite.db /tmp/db-replica.db && wc -c /tmp/db-replica.db"
```

File sizes should be within 4KB (one WAL frame) of each other.

### Monitoring lag in production

Add to your monitoring dashboard:

```bash
# LiteFS exports metrics at /debug/vars (JSON)
# Key metric: .DBs[].Pos (WAL position) — primary and replica should be close

# Get position from primary
PRIMARY_POS=$(fly ssh console -a shop-3ecf -s <cdg-id> \
  --command "curl -s http://localhost:20202/debug/vars" | jq '.DBs[0].Pos')

# Get position from replica
REPLICA_POS=$(fly ssh console -a shop-3ecf -s <lhr-id> \
  --command "curl -s http://localhost:20202/debug/vars" | jq '.DBs[0].Pos')

# Lag = primary_pos - replica_pos
echo "Replication lag: $((PRIMARY_POS - REPLICA_POS)) positions"
```

### What replication lag means for users

- **Catalog/product reads:** Tolerable up to 1-2 seconds. A new product might take a moment to appear on the replica, but this is acceptable for browsing.
- **Inventory/stock counts:** Tolerable up to 500ms. Stock count might be slightly stale on a replica, but actual purchases go through the primary.
- **Cart/session reads:** Reads that need to reflect the user's own recent writes should **not** happen on replicas. Use `checkCookieForTransactionalConsistency()` from `litefs-js` to ensure read-your-writes: the cookie carries the last-known TXID, and the middleware waits for the replica to catch up to that TXID before serving the response.
- **Order confirmation pages:** MUST serve from primary (use `ensurePrimary()` or explicit primary routing) — users should never see a "order not found" because the replica hasn't caught up yet.

### Mitigation for high-lag scenarios

If replication lag exceeds 1 second for > 5 minutes:
1. Check primary CPU/memory: `fly ssh console -a shop-3ecf -s <cdg-id> --command "top -bn1 | head -5"`
2. Check LiteFS WAL size: `fly ssh console -a shop-3ecf -s <cdg-id> --command "ls -la /data/litefs/"`
3. If WAL is > 100MB, the replica may be falling behind — consider a `litefs export` / re-import cycle
4. If primary is CPU-bound, scale up: `fly scale vm shared-cpu-2x -a shop-3ecf`

---

## Step 6 — End-to-End Smoke Test

Run the full test suite to verify nothing is broken:

```bash
# Unit tests (should pass regardless of region count)
pnpm vitest run

# E2E tests (run against staging with multi-region)
# Note: playwright tests are single-region by default; multi-region E2E requires
# deploying to staging first (P2.5), then running against the public URL
pnpm playwright test --workers=1
```

### Manual smoke test checklist

- [ ] Browse product listing from replica region (check `fly-region` header = `lhr`)
- [ ] Add item to cart (should redirect to primary transparently)
- [ ] Checkout flow (all mutations go to primary)
- [ ] Login/auth flow (OAuth callback uses `ensurePrimary()`)
- [ ] Admin dashboard (read operations from any region, mutations to primary)
- [ ] Search results (read-only, should work from replica)
- [ ] `/litefs/health` returns 200 on both primary and replica
- [ ] `/resources/healthcheck` returns 200 on both

---

## Step 7 — Rollback

If the new region causes issues (increased latency, replication failures, cost concerns), rollback is simple:

### 7.1 Remove the region

```bash
# Remove London from the region pool
fly regions remove lhr -a shop-3ecf

# Scale back to 1 machine
fly scale count 1 -a shop-3ecf

# Verify
fly regions list -a shop-3ecf
# Expected: Region Pool: cdg
fly status -a shop-3ecf
# Expected: 1 machine, region cdg
```

### 7.2 What happens during rollback

1. Fly.io terminates the VM in `lhr`
2. LiteFS on the primary detects the replica is gone (Consul health check fails)
3. No data loss — the primary continues operating normally
4. The primary's `fly.toml` comment is updated to remove the region entry
5. No application restart needed on the primary

### 7.3 Rollback smoke test

After rollback, verify normal operation:

```bash
# All checks passing
fly checks list -a shop-3ecf

# Single region confirmed
fly regions list -a shop-3ecf

# App responds from primary
curl -sI https://shop-3ecf.fly.dev/ | grep fly-region
# fly-region: cdg
```

---

## Constraints and Known Limitations

### LiteFS constraints

| Constraint | Detail | Impact |
|-----------|--------|--------|
| **Max write throughput** | ~100 transactions/second | OK for e-commerce CRUD; insufficient for analytics/event sourcing |
| **Single primary** | Only one writer at a time | Writes must route to primary (handled by `ensurePrimary()`) |
| **Async replication** | Replicas are eventually consistent | Read-your-writes requires `checkCookieForTransactionalConsistency()` |
| **FUSE overhead** | ~5-10% read latency on replicas | Acceptable for catalog reads; avoid for latency-sensitive endpoints |
| **SQLite only** | No PostgreSQL/MySQL support | Not a constraint for this project (uses SQLite) |
| **Fly.io only** | LiteFS requires Fly.io's internal network | Cannot replicate to non-Fly regions |

### Operational constraints

| Constraint | Detail |
|-----------|--------|
| **Consul dependency** | If Consul is unreachable, new replicas cannot join and primary election stalls |
| **Cold start time** | New replica must sync the entire database (~30s/GB) before serving reads |
| **No cross-cloud DR** | LiteFS cannot replicate to AWS/GCP/Azure; for cross-cloud DR, use `litefs export` + manual import |
| **Cache inconsistency** | Cache writes on replicas are dropped (currently); uncomment `updatePrimaryCacheValue` for full consistency |

### Cost estimate

| Configuration | Fly.io monthly cost (approx.) |
|--------------|-------------------------------|
| 1 region (cdg, shared-cpu-1x) | ~$5.70/mo |
| 2 regions (cdg + lhr, shared-cpu-1x each) | ~$11.40/mo |
| 3 regions (cdg + lhr + fra) | ~$17.10/mo |

Plus ~$0.15/GB for the persistent volume in each region. A typical e-commerce SQLite database is 50-500MB, adding $0.01-$0.08/region/month.

---

## Open Questions (for future operators)

These questions were identified during the architecture research and should be answered as you gain production experience:

1. **When should the primary region change?** If customer geography shifts (e.g., US customers outweigh EU), should `PRIMARY_REGION` move to a US region? What's the migration procedure?
2. **What is the real-world replication lag distribution?** Benchmarks say <100ms p50, but this needs production validation with actual write patterns.
3. **How does `checkCookieForTransactionalConsistency()` perform under load?** The cookie-based TXID waiting adds latency on every read-after-write. Measure p50/p99 with production traffic.
4. **What happens when Consul is degraded?** Fly.io Consul has an SLA, but what's the actual failover time when a Consul node goes down?
5. **Does LiteFS handle schema migrations safely?** The current `litefs.yml` runs `prisma migrate deploy` on candidate promotion. What happens if migration fails on the primary but replicas are mid-sync?
6. **What is the blast radius of a bad deploy?** If a buggy deploy goes to all regions simultaneously, can we roll back region-by-region?
7. **How does the LiteFS proxy handle websockets?** If the app adds websocket support (e.g., real-time cart updates), does the LiteFS proxy pass them through correctly?
8. **What monitoring is actionable?** Which LiteFS metrics at `/debug/vars` should trigger alerts, and at what thresholds?
9. **Can we warm up a replica before routing traffic to it?** When adding a region, the initial sync takes ~30s/GB. Can we defer traffic until sync is complete?
10. **What is the failure mode when a replica's disk fills up?** The `/data` volume has a fixed size. What happens to LiteFS replication when the volume is full?

---

## Related Documents

- `other/litefs.yml` — LiteFS configuration (Consul lease, proxy, exec commands)
- `app/utils/litefs.server.ts` — Server-side LiteFS integration (`ensurePrimary`, `getInstanceInfo`)
- `app/entry.server.tsx` — Fly instance headers injection
- `other/Dockerfile` — LiteFS binary inclusion and environment setup
- `docs/decisions/` — Architecture Decision Records (create this directory and add an ADR for the first multi-region rollout)

## External References

- [LiteFS Architecture Guide](https://github.com/superfly/litefs/blob/main/ARCHITECTURE.md)
- [Fly.io LiteFS Documentation](https://fly.io/docs/litefs/)
- [LiteFS Multi-Region Guide](https://fly.io/docs/litefs/getting-started-multi-region/)
- [litefs-js npm package](https://www.npmjs.com/package/litefs-js)
- [Fly.io Regions Reference](https://fly.io/docs/reference/regions/)
