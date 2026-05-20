# LiteFS Multi-Region Read Replica Setup Playbook

> **Target:** Shop (`shop-3ecf`) — Epic Stack e-commerce app on Fly.io
> **Status:** Single-region (CDG/Paris) with LiteFS single-node, ready for multi-region read replicas
> **Last updated:** 2026-05-20

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Multi-Region Scale-Out Procedure](#3-multi-region-scale-out-procedure)
4. [Read Replica Configuration](#4-read-replica-configuration)
5. [Write Routing (ensurePrimary)](#5-write-routing-ensureprimary)
6. [Transactional Consistency for Reads](#6-transactional-consistency-for-reads)
7. [Monitoring & Health Checks](#7-monitoring--health-checks)
8. [Failover Procedures](#8-failover-procedures)
9. [Troubleshooting](#9-troubleshooting)
10. [When to Move Off LiteFS](#10-when-to-move-off-litefs)
11. [Appendix: Reference Configurations](#11-appendix-reference-configurations)

---

## 1. Architecture Overview

### How LiteFS Works

```
                   ┌─────────────────────┐
                   │    Fly Proxy         │
                   │  (routes to nearest) │
                   └──────┬──────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │  Primary  │   │  Replica  │   │  Replica  │
    │  CDG/Paris│   │  AMS      │   │  FRA      │
    │  R/W      │   │  R/O      │   │  R/O      │
    └─────┬─────┘   └─────▲─────┘   └─────▲─────┘
          │               │               │
          └───────────────┴───────────────┘
              LTX streaming replication
              (async, via Consul lease)
```

**Key architecture properties:**

| Property | Detail |
|---|---|
| **Replication model** | Single-primary, async via LTX transaction log files |
| **Replication lag** | Subsecond same-region; cross-region adds network RTT (~20-50ms within EU) |
| **Write throughput limit** | ~100 transactions/second (FUSE bottleneck, officially documented) |
| **Failover** | Automatic. Consul lease TTL = 10s; lock delay = 1s. Total: ~11s max |
| **Split-brain protection** | Rolling checksum on each LTX file; stale primary refuses writes |
| **Reads on replicas** | Always available, even during failover |
| **Max DB size** | No hard limit; typical for this use case: ≤10 GB |
| **Cost** | ~$6-10/month for a 2-node HA cluster on Fly.io |
| **Software maturity** | Pre-1.0 but stable and in production use (Fly.io's recommended SQLite solution) |

### Current Shop State (shop-3ecf)

- **Primary region:** CDG (Paris)
- **LiteFS version:** 0.5.14 (pinned in Dockerfile)
- **Config file:** `other/litefs.yml` (copied to `/etc/litefs.yml` in container)
- **Mount:** `/data` persistent volume, LiteFS FUSE dir at `${LITEFS_DIR}` (`/litefs/data`)
- **Databases:** `sqlite.db` (main) + `cache.db` (cachified cache)
- **App-level write routing:** `ensurePrimary()` on auth callback; `currentIsPrimary` checks for cache mutations
- **Replication lag handling:** `litefs-js` package checks txid cookies for transactional consistency on reads after writes

---

## 2. Prerequisites

### Before scaling out, verify:

- [ ] **Database size check:** `sqlite3 /litefs/data/sqlite.db "SELECT COUNT(*) FROM sqlite_master;"` — confirm DB is under 10 GB
- [ ] **Write rate check:** Monitor writes/sec in production for at least 24h. If consistently > 100 txns/sec, LiteFS is not suitable — see [Section 10](#10-when-to-move-off-litefs)
- [ ] **Fly.io org access:** You need admin access to the `shop-3ecf` Fly.io org
- [ ] **CLI installed:** `flyctl` v0.3.0+ (`fly version`)
- [ ] **Auth:** `fly auth login` and confirm you can `fly status -a shop-3ecf`
- [ ] **Review current `fly.toml`** to choose target regions (see [Section 3](#3-multi-region-scale-out-procedure))

### Recommended regions for Shop (EU-centric)

| Region | Code | Latency from CDG | Rationale |
|---|---|---|---|
| Paris (primary) | `cdg` | baseline | Primary, closest to Stripe webhooks |
| Amsterdam | `ams` | ~10ms | Low latency, large Fly presence |
| Frankfurt | `fra` | ~15ms | EU coverage, GDPR-friendly |
| London | `lhr` | ~10ms | Post-Brexit coverage still useful |

Start with **CDG + AMS** (2 nodes). Add FRA/LHR as traffic grows.

---

## 3. Multi-Region Scale-Out Procedure

### Step 1: Create volumes for new regions

For EACH new region, create a persistent volume. Volumes are per-region:

```bash
# Create volume in Amsterdam
fly volumes create data \
  --region ams \
  --size 3 \
  --app shop-3ecf

# Create volume in Frankfurt (when ready)
fly volumes create data \
  --region fra \
  --size 3 \
  --app shop-3ecf
```

Volume size recommendations:
- Start with 3 GB (current DB + headroom for LTX logs and cache)
- Monitor `fly volumes list -a shop-3ecf` and resize if approaching limit
- LiteFS data dir (`/data/litefs`) stores internal state — budget ~500 MB for it

### Step 2: Scale machines to new regions

```bash
# Add 1 machine in Amsterdam (shares same app, auto-joins LiteFS cluster)
fly machine clone <existing-machine-id> \
  --region ams \
  --app shop-3ecf

# Verify all machines
fly machines list -a shop-3ecf
```

Expected output: 2 machines (1 cdg, 1 ams). The LiteFS cluster auto-forms via Consul.

### Step 3: Update `fly.toml` if needed

The current `fly.toml` is region-agnostic — no changes needed for basic scale-out. The `PRIMARY_REGION` env var is not set as a Fly secret; it's derived from the `lease.candidate` expression in `litefs.yml`:

```yaml
# other/litefs.yml (existing)
lease:
  type: 'consul'
  candidate: ${FLY_REGION == PRIMARY_REGION}
  promote: true
```

**⚠️ IMPORTANT:** If `PRIMARY_REGION` env var is not set, set it now:

```bash
fly secrets set PRIMARY_REGION=cdg -a shop-3ecf
```

Without this, ALL nodes are candidates and the first to acquire the Consul lease becomes primary — which works, but is non-deterministic on restart.

### Step 4: Verify cluster formation

After machines start (~30-60 seconds for first boot):

```bash
# Check all machines are running
fly status -a shop-3ecf

# SSH into each machine and check LiteFS status
fly ssh console -a shop-3ecf -s   # pick a specific machine
# once inside:
litefs export -name sqlite.db /dev/null  # verifies LiteFS is running
```

Check replication via the app's health endpoint:

```bash
# On any machine, hit the internal health check
curl http://localhost:8080/litefs/health
```

Also verify the cache inspector shows both instances:
- Navigate to `/admin/cache` in the app
- The "Instances" section should list both `cdg` and `ams` nodes

### Step 5: Smoke test

```bash
# 1. Read test: hit the public URL — should resolve to nearest region
curl -I https://shop-3ecf.fly.dev/resources/healthcheck

# 2. Write test: login via OAuth — writes session to DB on primary
#    (ensurePrimary() in auth callback routes the write correctly)

# 3. Replication test: create a product (admin), then read it immediately
#    from a replica region — may need txid cookie for consistency
```

---

## 4. Read Replica Configuration

### How the app already handles reads

The Shop app is built read-friendly by default:

1. **Loaders (GET requests) do NOT call `ensurePrimary()`** — they execute on whichever instance Fly routes to
2. **`getInstanceInfo()` returns `currentIsPrimary`** — used in `cache.server.ts` to skip cache writes on replicas (line 33: `if (!currentIsPrimary) return db`)
3. **`handleDataRequest`** in `entry.server.tsx` attaches `fly-region` and `fly-primary-instance` headers to every response — useful for debugging routing

### What works automatically on replicas

| Operation | Works on replica? | Notes |
|---|---|---|
| Page loads / SSR | ✅ Yes | No DB writes during rendering |
| Product browsing | ✅ Yes | Read-only queries |
| Cart reads | ✅ Yes | Cart stored in cookie, not DB |
| Cache reads (SQLite) | ✅ Yes | `cache.get()` reads from local replica |
| Cache reads (LRU) | ✅ Yes | In-memory, instance-local |
| Admin dashboard reads | ✅ Yes | Read-only queries |
| Health check | ✅ Yes | `/resources/healthcheck`, `/litefs/health` |

### What requires primary (write-routed)

| Operation | Requires primary? | Mechanism |
|---|---|---|
| OAuth login callback | ✅ Yes | `ensurePrimary()` in `auth.$provider.callback.ts` |
| Checkout / Stripe webhook | ✅ Yes | Webhook handler must write order state |
| Admin CRUD mutations | ✅ Yes | Form actions write to DB |
| Cache writes (SQLite) | ✅ Yes | `cache.set()` checks `currentIsPrimary` |
| Passkey registration | ✅ Yes | Writes credential to DB |

### Adding ensurePrimary to new write routes

Pattern from the existing codebase:

```typescript
import { ensurePrimary } from '#app/utils/litefs.server.ts'

export async function action({ request }: Route.ActionArgs) {
  // Guard: only the primary can handle writes
  await ensurePrimary()

  // ... mutation logic
}
```

If `ensurePrimary()` is called on a replica:
- `litefs-js` issues a **307 Temporary Redirect** to the primary instance's internal URL
- The request is transparently replayed on the primary
- The response is streamed back to the client

**⚠️ File uploads:** 307 replay does NOT work for `multipart/form-data` — the request body is already consumed. For file upload routes, use a different pattern:
```typescript
// Option A: Proxy to primary with client-side redirect
// Option B: Accept on replica, queue to primary via internal endpoint
```

Currently the Shop app has no file upload routes that write to DB — forms use `application/x-www-form-urlencoded`, which replays correctly.

---

## 5. Write Routing (ensurePrimary)

### Internal mechanism (how litefs-js routes writes)

```
Client (in AMS)
  │
  │  POST /auth/github/callback
  ▼
Replica (AMS)
  │
  │  await ensurePrimary()
  │  → litefs-js detects !currentIsPrimary
  │  → Returns 307 redirect to:
  │    http://<primary-hostname>.vm.shop-3ecf.internal:8080/auth/github/callback
  │
  ▼
Client follows 307
  │
  │  Same POST, now to primary's internal URL
  ▼
Primary (CDG)
  │
  │  Handles the write
  │  → Returns response (session cookie, redirect)
  │
  ▼
Client receives response with Set-Cookie from primary
```

**Key points:**
- The 307 preserves the HTTP method and body
- The client (browser) follows the redirect to the internal `.vm.shop-3ecf.internal` address — this works because Fly's internal network is accessible from all instances
- Session cookies set by the primary are preserved in the response

### Debugging ensurePrimary routing

If users report "auth loops" or failed mutations on replicas, check:

```bash
# SSH into a replica
fly ssh console -a shop-3ecf -r ams

# Check instance info
curl http://localhost:8080/resources/healthcheck -v 2>&1 | grep fly-
# Look for: fly-primary-instance, fly-instance headers

# Check LiteFS primary
litefs export -name sqlite.db /dev/null && echo "Reachable"
```

---

## 6. Transactional Consistency for Reads

### The "read your writes" problem

After a write on the primary, data may not yet be replicated to the replica that handles the next read. This causes:
- User updates profile → redirected to profile page → sees stale data
- Places order → order confirmation page → "order not found"

### Solution: txid cookies (already implemented)

The Shop uses `litefs-js`'s `handleTransactionalConsistency` and `appendTxNumberCookie`:

- After every write on the primary, LiteFS assigns an incrementing **txid** (transaction ID)
- `litefs-js` sets a cookie (`__txid`) with the latest txid after each response from the primary
- On subsequent reads, if the cookie txid > current replica txid, the read is **blocked until the replica catches up** (`waitForUpToDateTxNumber`)

This is already wired up in `litefs.server.ts` via:
- `getTxNumber()` / `waitForUpToDateTxNumber()` — block until replica is current
- `checkCookieForTransactionalConsistency()` — check txid cookie before serving read
- `appendTxNumberCookie()` — set cookie after write response

### No action needed

This is already implemented. Verify it works:

```bash
# After a write (login, profile update), check cookies:
curl -v https://shop-3ecf.fly.dev/ 2>&1 | grep -i set-cookie
# Should see: __txid=...

# On a replica, check txid:
fly ssh console -a shop-3ecf -r ams -C "litefs export -name sqlite.db /dev/null 2>&1 | grep txid"
```

---

## 7. Monitoring & Health Checks

### Fly-level checks (in `fly.toml`)

```toml
[[services.http_checks]]
  interval = "10s"
  grace_period = "5s"
  method = "get"
  path = "/resources/healthcheck"
  protocol = "http"
  timeout = "2s"

[[services.http_checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  timeout = "5s"
  path = "/litefs/health"
```

- `/resources/healthcheck` — app-level (Express + React Router alive)
- `/litefs/health` — LiteFS-level (FUSE mount healthy, can read DB)

### Metrics to monitor

| Metric | How to check | Warning threshold | Critical threshold |
|---|---|---|---|
| **Replication lag** | Compare txid across instances via admin cache page | > 1 second | > 5 seconds |
| **Write throughput** | LiteFS internal metrics (txns/sec) | > 50/sec sustained | > 100/sec (bottleneck) |
| **Disk usage** | `fly volumes list -a shop-3ecf` | > 70% | > 85% |
| **Failover count** | Fly dashboard → app events | Any unplanned failover | > 2 in 24h |
| **307 replay rate** | App logs: count `ensurePrimary` redirects | > 10% of requests | > 30% (too many writes hitting replicas) |

### Admin cache inspector

The existing `/admin/cache` page shows all instances and their regions. This is the quickest way to visually confirm all replicas are online and reachable.

```
┌─────────────────────────────────────────────────────┐
│ Instances                                            │
│ ● e7841234  cdg  (primary)                          │
│ ○ a1125678  ams                                     │
└─────────────────────────────────────────────────────┘
```

### Setting up alerts (recommended)

```bash
# Fly.io metrics can be exported to external monitoring
# Consider adding a cron health-check job:
fly machines run . -a shop-3ecf \
  --shell \
  --command "curl -sf http://localhost:8080/litefs/health || exit 1"
```

---

## 8. Failover Procedures

### How automatic failover works

1. Primary instance becomes unhealthy (crash, network partition, Fly migration)
2. Consul lease expires after **10 seconds** (TTL)
3. Another candidate node acquires the lease (+ ~1 second lock delay)
4. New primary promotes itself, starts accepting writes
5. LiteFS proxy on the new primary opens the DB for writes
6. FUSE layer on all nodes redirects to the new primary

**Total downtime for writes: ≤ 11 seconds.** Reads remain available throughout.

### Manual failover (planned maintenance)

```bash
# 1. Identify current primary
fly status -a shop-3ecf
# Look for PRIMARY_REGION match

# 2. Gracefully step down the primary
fly ssh console -a shop-3ecf -r cdg
# Inside:
litefs export -name sqlite.db /dev/null  # verify it's primary
# Then stop the app process — LiteFS will release the lease
# Fly will auto-promote another candidate within 10s

# 3. Verify new primary
fly ssh console -a shop-3ecf -r ams
litefs export -name sqlite.db /dev/null
# If this succeeds without error, AMS is now primary

# 4. Restart old primary as replica
fly machine restart <old-primary-id> -a shop-3ecf
```

### Emergency failover (primary unresponsive)

```bash
# 1. Force-stop the primary machine
fly machine stop <primary-machine-id> -a shop-3ecf

# 2. Wait 15 seconds (10s lease TTL + safety margin)

# 3. Check new primary
fly ssh console -a shop-3ecf -r ams -C "litefs export -name sqlite.db /dev/null && echo 'IS PRIMARY'"

# 4. Once stabilised, restart old primary as replica
fly machine start <old-primary-id> -a shop-3ecf
```

### Post-failover verification

```bash
# Check cluster health from every instance
for region in cdg ams; do
  echo "=== $region ==="
  fly ssh console -a shop-3ecf -r $region -C "curl -sf http://localhost:8080/litefs/health"
done

# Verify replication is flowing
# Check admin cache page → all instances listed
```

---

## 9. Troubleshooting

### Symptom: Replication lag > 5 seconds

**Cause:** Write throughput exceeding FUSE bandwidth (~100 txn/sec).

**Fix:**
1. Check if there's a burst of writes (seed script running? bulk import?)
2. If sustained: consider batching writes or moving to managed Postgres (see [Section 10](#10-when-to-move-off-litefs))
3. Short-term: reduce write pressure by deferring non-critical writes

```bash
# Check current write rate on primary
fly ssh console -a shop-3ecf -r cdg
# LiteFS doesn't expose write rate directly; proxy by checking
# txid increment rate over 10 seconds
```

### Symptom: "database is locked" errors on replicas

**Cause:** Replica trying to write (missing `ensurePrimary()` guard).

**Fix:** Add `ensurePrimary()` to the route's action/loader that performs writes. Audit all mutation routes:

```bash
# Find all form actions without ensurePrimary
rg "export async function action" app/routes/ -l \
  | xargs rg -L "ensurePrimary"
```

### Symptom: Two primaries (split brain)

**Rare.** LiteFS uses rolling checksums to detect split-brain. Symptoms:
- Divergent data between regions
- Consul key showing two leaseholders

**Recovery:**
```bash
# 1. Stop all instances
fly machine stop --all -a shop-3ecf

# 2. Identify the instance with the most recent data
#    (compare txid via litefs export)

# 3. Restart the chosen primary first
fly machine start <chosen-primary> -a shop-3ecf

# 4. Once primary is up, restart others
fly machine start <replica-1> <replica-2> -a shop-3ecf

# 5. Replicas will re-sync from the primary's LTX log
```

### Symptom: ensurePrimary() 307 loops

**Cause:** Primary's internal hostname not resolving.

**Check:**
```bash
fly ssh console -a shop-3ecf -r ams
# Can the replica reach the primary's internal domain?
curl -I "http://<primary-hostname>.vm.shop-3ecf.internal:8080/resources/healthcheck"
```

**Fix:** If unreachable, check Fly private network (`fly ips list -a shop-3ecf`). All instances on the same app share the private 6PN network by default.

### Symptom: FUSE mount errors on startup

**Cause:** Stale mount from unclean shutdown.

**Fix:**
```bash
fly ssh console -a shop-3ecf
# Check mount status
mount | grep litefs
# If stuck:
fusermount -uz /litefs/data
# Then restart the machine
```

---

## 10. When to Move Off LiteFS

The parent research task identified clear migration triggers. Act on these **before** users are impacted:

### Migration triggers

| Trigger | Threshold | Recommended alternative |
|---|---|---|
| **Sustained write rate > 100 txns/sec** | Any sustained period > 5 minutes | Managed Postgres (Fly Postgres, Supabase, Neon) |
| **Replication lag > 5s chronically** | > 1 hour cumulative per day | Managed Postgres with sync replication |
| **Database size > 10 GB** | Approaching volume limit | Turso (libsql) or managed Postgres |
| **Need for synchronous replication** | Business requirement (orders, payments) | Managed Postgres with sync standby |
| **Need for point-in-time recovery** | Compliance/audit requirement | Managed Postgres with WAL archiving (PITR) |
| **Multiple apps sharing the DB** | > 2 apps reading/writing | Turso (multi-tenant libsql) or managed Postgres |

### Migration path: LiteFS → Fly Postgres

1. **Provision Fly Postgres** in primary region:
   ```bash
   fly postgres create --name shop-db --region cdg
   ```

2. **Migrate schema + data:**
   ```bash
   # Dump from current SQLite
   fly ssh console -a shop-3ecf -r cdg
   sqlite3 /litefs/data/sqlite.db .dump > /tmp/dump.sql

   # Convert and load into Postgres (use pgloader or manual)
   # Update Prisma schema to postgresql provider
   ```

3. **Update app config:**
   - Change `DATABASE_URL` to Postgres connection string
   - Remove LiteFS config (`other/litefs.yml`)
   - Remove `COPY --from=flyio/litefs` from Dockerfile
   - Change `CMD ["litefs", "mount"]` to `CMD ["node", "index.js"]`
   - Remove `ensurePrimary()` calls (Postgres handles write routing natively)

4. **Deploy, smoke test, switch DNS.**

### Migration path: LiteFS → Turso

Turso provides libsql (SQLite-compatible) with built-in multi-region replication, suitable when you want to keep the SQLite model but need better replication guarantees.

---

## 11. Appendix: Reference Configurations

### Current `other/litefs.yml` (annotated)

```yaml
fuse:
  dir: '${LITEFS_DIR}'                          # /litefs/data

data:
  dir: '/data/litefs'                            # LiteFS internal state

proxy:
  addr: ':${INTERNAL_PORT}'                      # :8080
  target: 'localhost:${PORT}'                    # localhost:8081 (Express)
  db: '${DATABASE_FILENAME}'                     # sqlite.db

lease:
  type: 'consul'
  candidate: ${FLY_REGION == PRIMARY_REGION}     # Only CDG can be primary
  promote: true                                  # Auto-promote on lease acquire
  advertise-url: 'http://${HOSTNAME}.vm.${FLY_APP_NAME}.internal:20202'

  consul:
    url: '${FLY_CONSUL_URL}'
    key: 'epic-stack-litefs_20250222/${FLY_APP_NAME}'

exec:
  - cmd: pnpm exec prisma migrate deploy         # Primary only: run migrations
    if-candidate: true
  - cmd: sqlite3 $DATABASE_PATH "PRAGMA journal_mode = WAL;"
    if-candidate: true
  - cmd: sqlite3 $CACHE_DATABASE_PATH "PRAGMA journal_mode = WAL;"
    if-candidate: true
  - cmd: pnpm exec prisma generate --sql         # All nodes: generate typed SQL
  - cmd: pnpm start                              # All nodes: start Express
```

### Current `fly.toml` excerpts

```toml
app = "shop-3ecf"
primary_region = "cdg"

[mounts]
source = "data"
destination = "/data"
```

### Current Dockerfile LiteFS section

```dockerfile
# Line 91-97
COPY --from=flyio/litefs:0.5.14 /usr/local/bin/litefs /usr/local/bin/litefs
ADD other/litefs.yml /etc/litefs.yml
RUN mkdir -p /data ${LITEFS_DIR}
CMD ["litefs", "mount"]
```

### Key environment variables

| Variable | Value | Set in |
|---|---|---|
| `FLY` | `true` | Dockerfile |
| `LITEFS_DIR` | `/litefs/data` | Dockerfile |
| `DATABASE_FILENAME` | `sqlite.db` | Dockerfile |
| `DATABASE_PATH` | `$LITEFS_DIR/$DATABASE_FILENAME` | Dockerfile |
| `DATABASE_URL` | `file:$DATABASE_PATH` | Dockerfile |
| `CACHE_DATABASE_PATH` | `$LITEFS_DIR/cache.db` | Dockerfile |
| `INTERNAL_PORT` | `8080` | Dockerfile |
| `PORT` | `8081` | Dockerfile |
| `PRIMARY_REGION` | `cdg` | Must be set via `fly secrets` |
| `FLY_REGION` | (auto) | Fly runtime |
| `FLY_APP_NAME` | `shop-3ecf` | Fly runtime |
| `FLY_CONSUL_URL` | (auto) | Fly runtime |

### Adding a third region (quick reference)

```bash
# 1. Create volume
fly volumes create data --region fra --size 3 -a shop-3ecf

# 2. Clone a machine to the new region
fly machine clone <existing-id> --region fra -a shop-3ecf

# 3. Verify
fly status -a shop-3ecf
# Should show 3 machines: cdg, ams, fra

# Done. No config changes needed.
```

---

## References

- [LiteFS official docs](https://fly.io/docs/litefs/)
- [LiteFS Architecture](https://github.com/superfly/litefs/blob/main/docs/ARCHITECTURE.md)
- [LiteFS FAQ](https://fly.io/docs/litefs/faq/)
- [litefs-js npm package](https://www.npmjs.com/package/litefs-js)
- [Epic Stack LiteFS integration](https://github.com/epicweb-dev/epic-stack)
- Parent research: `litefs-research.md` (task `t_354284f8`)
