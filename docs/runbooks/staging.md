# Staging Environment

> **App:** shop-3ecf-staging
> **Config:** fly.staging.toml
> **Deploy branch:** dev

## Overview

The staging environment is a near-identical copy of production running on Fly.io. It is deployed automatically from the `dev` branch.

Key differences from production:
- **No auto-rollback** — breakage is acceptable on staging
- **Stripe test mode** — uses `sk_test_*` keys, not `sk_live_*`
- **Separate app:** `shop-3ecf-staging` (production is `shop-3ecf`)
- Config at `fly.staging.toml` (production uses `fly.toml`)

## URLs

| Environment | URL |
|---|---|
| Production | https://shop-3ecf.fly.dev |
| Staging | https://shop-3ecf-staging.fly.dev |

## Deploy Pipeline

1. Push to `dev` branch
2. GitHub Actions builds container → deploys to `shop-3ecf-staging`
3. Manual promotion to production: merge `dev` → `main`

## DR Rehearsal in Staging

Use staging to rehearse disaster recovery procedures before executing them in production.

### Restore from backup in staging

```bash
APP="shop-3ecf-staging"

# 1. Download a production backup (or use a staging backup)
#    ⚠️ Never use production data with real customer PII in staging!
#    Use a sanitized backup or a fresh seed instead.

# 2. Follow the restore procedure from ./backup-restore.md
#    Replace "shop-3ecf" with "shop-3ecf-staging"

# 3. Verify
curl -s "https://${APP}.fly.dev/resources/healthcheck"
flyctl logs --app "${APP}" | grep -i error
```

### Test database corruption scenario

```bash
APP="shop-3ecf-staging"

# 1. Simulate corruption (in staging only!)
flyctl ssh console --app "${APP}" --command \
  'sqlite3 /litefs/data/sqlite.db "DROP TABLE IF EXISTS Order;"'

# 2. Verify the app is broken
curl -s "https://${APP}.fly.dev" | head -5

# 3. Execute restore procedure from ./disaster-recovery.md, Scenario 2
# (or ./backup-restore.md for the step-by-step)

# 4. Verify recovery
curl -s "https://${APP}.fly.dev/resources/healthcheck"
flyctl ssh console --app "${APP}" --command \
  'sqlite3 /litefs/data/sqlite.db ".tables"'
```

## Secrets

Staging secrets are managed separately from production:

```bash
# List staging secrets
flyctl secrets list --app shop-3ecf-staging

# Set a staging-specific secret
flyctl secrets set SOME_KEY="staging-value" --app shop-3ecf-staging
```

Staging should use test credentials for all services:
- **Stripe:** Test mode keys (`sk_test_*`)
- **Resend:** A separate test API key or the same key with test domain
- **GitHub OAuth:** A separate OAuth app for staging with `shop-3ecf-staging.fly.dev` callback URL
- **Tigris:** Can share the same bucket (different key prefixes) or a separate test bucket

## Related Documents

- [Disaster Recovery Runbook](./disaster-recovery.md) — Rehearsal schedule and full DR scenarios
- [Backup & Restore Runbook](./backup-restore.md) — Database backup and restore
- [Credential Rotation Runbook](./credential-rotation.md) — Secret management
