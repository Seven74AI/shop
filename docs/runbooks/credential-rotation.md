# Credential Rotation Runbook

> **Status:** Live document — update when credentials or rotation procedures change.
> **App:** shop-3ecf (production), shop-3ecf-staging (staging)

## Overview

This document is the single source of truth for every secret the Shop application depends on: where it lives, what it powers, how to rotate it, and what breaks during rotation.

**Credential storage locations:**

| Location | How to access |
|---|---|
| **Fly.io secrets** | `flyctl secrets list --app shop-3ecf` (names only, values hidden) |
| **GitHub Actions secrets** | GitHub → Repo Settings → Secrets and Variables → Actions |
| **GitHub Actions variables** | GitHub → Repo Settings → Secrets and Variables → Variables |
| **Generated at build** | Dockerfile (INTERNAL_COMMAND_TOKEN) |

---

## Complete Secret Inventory

### Application Secrets (Fly.io)

These are set as Fly.io secrets and injected as environment variables at runtime.

#### Critical — If these break, the app is effectively down

| # | Variable | What it powers | Rotate where | Downtime during rotation |
|---|---|---|---|---|
| 1 | `STRIPE_SECRET_KEY` | Payment processing (Stripe) | Stripe Dashboard → API Keys → Roll key | ~2 min (machine restart) |
| 2 | `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Stripe Dashboard → Webhooks → Roll secret | ~2 min (machine restart) |
| 3 | `AWS_ACCESS_KEY_ID` | Tigris S3 object storage + daily backups | Tigris Console → Access Keys | ~2 min (machine restart) |
| 4 | `AWS_SECRET_ACCESS_KEY` | Tigris S3 object storage + daily backups | Tigris Console → Access Keys | ~2 min (machine restart) |
| 5 | `SESSION_SECRET` | Session cookie signing | Generate with `openssl rand -hex 32` | All users logged out |

#### High — Functional degradation without these

| # | Variable | What it powers | Rotate where | Downtime during rotation |
|---|---|---|---|---|
| 6 | `RESEND_API_KEY` | Transactional emails (order confirmations, password resets, receipts) | Resend Dashboard → API Keys | ~2 min (machine restart). Emails queued during restart will fail. |
| 7 | `GITHUB_CLIENT_SECRET` | GitHub OAuth login | GitHub → Settings → Developer Settings → OAuth Apps | ~2 min. Users can't log in with GitHub during restart. |
| 8 | `GITHUB_TOKEN` | GitHub API calls (avatar loading, repo data) | GitHub → Settings → Developer Settings → Personal Access Tokens | ~2 min. Avatars won't load during restart. |

#### Medium — Non-critical features

| # | Variable | What it powers | Rotate where | Downtime during rotation |
|---|---|---|---|---|
| 9 | `SENTRY_DSN` | Error tracking and monitoring | Sentry → Project Settings → Client Keys | No downtime (errors are dropped, not queued) |
| 10 | `INTERNAL_COMMAND_TOKEN` | Internal command endpoint auth | Auto-generated in Dockerfile on next deploy | ~2 min. Internal commands fail during restart. |
| 11 | `HONEYPOT_SECRET` | Anti-spam honeypot fields | Generate with `openssl rand -hex 32` | Honeypot validation fails during restart. |
| 12 | `MONDIAL_RELAY_API1_PRIVATE_KEY` | Mondial Relay pickup point search (API v1) | Contact Mondial Relay support | ~2 min. Pickup search fails during restart. |
| 13 | `MONDIAL_RELAY_API2_LOGIN` | Mondial Relay API v2 | Contact Mondial Relay support | ~2 min. |
| 14 | `MONDIAL_RELAY_API2_PASSWORD` | Mondial Relay API v2 | Contact Mondial Relay support | ~2 min. |
| 15 | `GITHUB_CLIENT_ID` | GitHub OAuth login (public identifier) | GitHub → OAuth Apps | ~2 min. |

#### Low / Configuration

| # | Variable | What it powers | Notes |
|---|---|---|---|
| 16 | `AWS_REGION` | S3 region for Tigris | Always `auto` — no rotation needed |
| 17 | `AWS_ENDPOINT_URL_S3` | Tigris S3 endpoint | Always `https://fly.storage.tigris.dev` |
| 18 | `BUCKET_NAME` | Product image storage bucket | Change only when migrating buckets |
| 19 | `BACKUP_BUCKET_NAME` | Database backup storage | Change only when migrating backup storage |
| 20 | `ALLOW_INDEXING` | SEO robots.txt control | Set to `true` or `false` |
| 21 | `DATABASE_PATH` | SQLite database location | Set in Dockerfile, not via secrets |

### CI/CD Secrets (GitHub Actions)

| # | Secret/Variable | Where | What it powers | Rotate where |
|---|---|---|---|---|
| 22 | `FLY_API_TOKEN` | GitHub Actions secrets | `flyctl deploy` from CI | `flyctl tokens create` |
| 23 | `SENTRY_AUTH_TOKEN` | GitHub Actions secrets | Sentry source maps upload during build | Sentry → Organization Settings → Auth Tokens |
| 24 | `SLACK_WEBHOOK_URL` | GitHub Actions variables | Backup failure notifications | Slack App → Incoming Webhooks |

---

## Rotation Procedures

### Stripe (Secrets #1, #2)

**Rotation cadence:** On compromise only (Stripe keys are long-lived by design)

```bash
# Stripe Secret Key (sk_live_*)
# 1. Go to https://dashboard.stripe.com/test/apikeys (test mode) or
#    https://dashboard.stripe.com/apikeys (live mode)
# 2. Find the secret key in use
# 3. Click "Roll key" — creates new key, old key works for 24h (grace period)
# 4. Copy the NEW key (starts with sk_live_)
# 5. Apply immediately:
flyctl secrets set STRIPE_SECRET_KEY="sk_live_<new-key>" --app shop-3ecf
# 6. Restart to pick up:
flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')
# 7. Verify: place a test order (or check Stripe Dashboard for new charges)
# 8. After 24h, old key is automatically revoked by Stripe

# Stripe Webhook Secret (whsec_*)
# 1. Go to https://dashboard.stripe.com/webhooks
# 2. Click the production webhook endpoint
# 3. Click "Roll secret"
# 4. Copy the new secret (starts with whsec_)
# 5. Apply:
flyctl secrets set STRIPE_WEBHOOK_SECRET="whsec_<new-secret>" --app shop-3ecf
flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')
# 6. Verify: trigger a test webhook from Stripe Dashboard
```

### AWS / Tigris (Secrets #3, #4)

**Rotation cadence:** On compromise, or every 90 days (best practice)

```bash
# 1. Go to Tigris Console → Access Keys
#    (URL: https://fly.io/dashboard/<org>/tigris)
# 2. Click "Create Access Key"
# 3. Copy BOTH Access Key ID and Secret Access Key immediately
#    (the secret is only shown once!)
# 4. DO NOT delete the old key yet

# 5. Update Fly.io secrets:
flyctl secrets set \
  AWS_ACCESS_KEY_ID="<new-access-key>" \
  AWS_SECRET_ACCESS_KEY="<new-secret-key>" \
  --app shop-3ecf

# 6. Also update staging:
flyctl secrets set \
  AWS_ACCESS_KEY_ID="<new-access-key>" \
  AWS_SECRET_ACCESS_KEY="<new-secret-key>" \
  --app shop-3ecf-staging

# 7. Restart both apps:
flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')
flyctl machine restart --app shop-3ecf-staging \
  $(flyctl machine list --app shop-3ecf-staging --json | jq -r '.[0].id')

# 8. Verify backups still work:
flyctl ssh console --app shop-3ecf --command 'node /myapp/scripts/backup-db.cjs'

# 9. Verify product images still load:
#    Browse the shop frontend — product images should display correctly

# 10. After confirming everything works, delete the OLD key in Tigris Console
```

### Resend (Secret #6)

**Rotation cadence:** On compromise, or every 180 days

```bash
# 1. Go to https://resend.com/api-keys
# 2. Click "Create API Key"
# 3. Give it a name (e.g., "shop-production")
# 4. Set permission to "Sending access"
# 5. Copy the key (starts with re_)
# 6. DO NOT delete the old key yet

# 7. Update Fly.io:
flyctl secrets set RESEND_API_KEY="re_<new-key>" --app shop-3ecf
flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')

# 8. Verify: trigger a test email
#    - Try password reset flow
#    - OR place a test order (should receive confirmation email)
#    - Check Resend Dashboard for the sent email

# 9. After confirming, delete the old key in Resend Dashboard
```

### Session & Honeypot Secrets (Secrets #5, #11)

**Rotation cadence:** On compromise, or every 180 days

```bash
# 1. Generate new secrets:
NEW_SESSION_SECRET=$(openssl rand -hex 32)
NEW_HONEYPOT_SECRET=$(openssl rand -hex 32)

echo "SESSION_SECRET: ${NEW_SESSION_SECRET}"
echo "HONEYPOT_SECRET: ${NEW_HONEYPOT_SECRET}"
# Save these in your password manager!

# 2. Update Fly.io:
flyctl secrets set \
  SESSION_SECRET="${NEW_SESSION_SECRET}" \
  HONEYPOT_SECRET="${NEW_HONEYPOT_SECRET}" \
  --app shop-3ecf

flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')

# ⚠️ IMPACT: ALL user sessions are invalidated.
# All users (including admins) must log in again.
# Consider adding a banner to the site announcing the change.
```

### GitHub OAuth (Secrets #7, #8, #15)

**Rotation cadence:** On compromise only (or when the personal access token expires)

```bash
# GitHub OAuth App Client Secret (#7)
# 1. Go to GitHub → Settings → Developer Settings → OAuth Apps → Shop
# 2. Click "Generate a new client secret"
# 3. Copy the new secret immediately (only shown once!)
# 4. DO NOT delete the old secret yet

# 5. Update Fly.io:
flyctl secrets set GITHUB_CLIENT_SECRET="<new-client-secret>" --app shop-3ecf
flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')

# 6. Verify: log in with GitHub OAuth
# 7. After confirming, delete the old secret in GitHub

# GitHub Personal Access Token (#8)
# 1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens
# 2. Generate a new token (classic) with `read:user` scope
# 3. Copy the token (starts with ghp_)

# 4. Update Fly.io:
flyctl secrets set GITHUB_TOKEN="ghp_<new-token>" --app shop-3ecf
flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')

# 5. Delete the old token in GitHub
```

### Sentry (Secrets #9, #23)

**Rotation cadence:** On compromise only

```bash
# Sentry DSN (#9 — Fly.io secret)
# 1. Go to Sentry → Projects → Shop → Settings → Client Keys (DSN)
# 2. Copy the DSN (not the public DSN — use the full DSN with secret)
# 3. Update Fly.io:
flyctl secrets set SENTRY_DSN="<new-dsn>" --app shop-3ecf
flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')

# Sentry Auth Token (#23 — GitHub Actions secret)
# 1. Go to Sentry → Settings → Auth Tokens
# 2. Create a new token with `project:releases` scope
# 3. Copy the token
# 4. Update in GitHub: Repo → Settings → Secrets → Actions
#    Update SENTRY_AUTH_TOKEN
# 5. Delete the old token in Sentry
# 6. Trigger a deploy to verify source maps upload
```

### Fly.io API Token (Secret #22 — GitHub Actions)

**Rotation cadence:** On compromise, or every 90 days

```bash
# 1. Generate a new token:
flyctl tokens create deploy --app shop-3ecf
# Or from Fly.io Dashboard → Account → Access Tokens

# 2. Copy the token (only shown once!)

# 3. Update in GitHub:
#    Repo → Settings → Secrets and Variables → Actions
#    Update FLY_API_TOKEN

# 4. Delete the old token:
flyctl tokens revoke <old-token-id>
# Or delete from Dashboard

# 5. Trigger a test deploy or wait for next push to main/dev
```

### Mondial Relay (Secrets #12, #13, #14)

**Rotation cadence:** On compromise only (keys managed by Mondial Relay)

```bash
# Contact Mondial Relay support to request key rotation.
# They will provide new credentials.
# Then update Fly.io:
flyctl secrets set \
  MONDIAL_RELAY_API1_PRIVATE_KEY="<new-key>" \
  MONDIAL_RELAY_API2_LOGIN="<new-login>" \
  MONDIAL_RELAY_API2_PASSWORD="<new-password>" \
  --app shop-3ecf

flyctl machine restart --app shop-3ecf \
  $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')
```

### Slack Webhook (Secret #24 — GitHub Actions variable)

**Rotation cadence:** On compromise only

```bash
# 1. Go to Slack App → Incoming Webhooks
# 2. Find the webhook for the backup alerts channel
# 3. Click "Regenerate" or create a new webhook and delete the old one
# 4. Copy the new webhook URL

# 5. Update in GitHub:
#    Repo → Settings → Secrets and Variables → Actions → Variables
#    Update SLACK_WEBHOOK_URL

# 6. Verify by triggering a manual backup run (or wait for 3am UTC)
```

---

## Emergency Bulk Rotation

In case of a widespread compromise (e.g., Fly.io account hacked, GitHub org compromised), rotate everything in this order:

```bash
APP="shop-3ecf"
STAGING="shop-3ecf-staging"

# Phase 1: Critical (do these first — payments, storage, sessions)
# Stripe → roll key in Dashboard, then:
flyctl secrets set STRIPE_SECRET_KEY="sk_live_<new>" STRIPE_WEBHOOK_SECRET="whsec_<new>" --app $APP
# AWS/Tigris → create new keys in Console, then:
flyctl secrets set AWS_ACCESS_KEY_ID="<new>" AWS_SECRET_ACCESS_KEY="<new>" --app $APP
# Sessions → generate with openssl, then:
flyctl secrets set SESSION_SECRET="$(openssl rand -hex 32)" HONEYPOT_SECRET="$(openssl rand -hex 32)" --app $APP

# Phase 2: Services (email, login)
flyctl secrets set RESEND_API_KEY="re_<new>" GITHUB_CLIENT_SECRET="<new>" GITHUB_TOKEN="ghp_<new>" --app $APP

# Phase 3: Monitoring + shipping
flyctl secrets set SENTRY_DSN="<new>" MONDIAL_RELAY_API1_PRIVATE_KEY="<new>" MONDIAL_RELAY_API2_LOGIN="<new>" MONDIAL_RELAY_API2_PASSWORD="<new>" --app $APP

# Phase 4: CI/CD
# Update FLY_API_TOKEN, SENTRY_AUTH_TOKEN, SLACK_WEBHOOK_URL in GitHub Actions

# Restart everything:
flyctl machine restart --app $APP $(flyctl machine list --app $APP --json | jq -r '.[0].id')
flyctl machine restart --app $STAGING $(flyctl machine list --app $STAGING --json | jq -r '.[0].id')

# Apply the same secrets to staging:
flyctl secrets set \
  STRIPE_SECRET_KEY="sk_test_<new>" \
  AWS_ACCESS_KEY_ID="<new>" \
  AWS_SECRET_ACCESS_KEY="<new>" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  --app $STAGING
```

---

## Verification Checklist After Any Rotation

- [ ] `curl -s https://shop-3ecf.fly.dev/resources/healthcheck` returns `{"status":"ok"}`
- [ ] `curl -s https://shop-3ecf.fly.dev/litefs/health` returns `{"ok":true}`
- [ ] Browse the shop frontend — products load
- [ ] Log in with GitHub OAuth
- [ ] Admin dashboard loads
- [ ] Place a test order (Stripe test mode)
- [ ] Receive order confirmation email (Resend)
- [ ] Product images display correctly (Tigris/S3)
- [ ] Check Sentry for new errors
- [ ] Trigger manual backup: `flyctl ssh console --app shop-3ecf --command 'node /myapp/scripts/backup-db.cjs'`

---

## Related Documents

- [Disaster Recovery Runbook](./disaster-recovery.md) — Full incident response including credential leak scenario
- [Backup & Restore Runbook](./backup-restore.md) — Database backup and restore procedures
