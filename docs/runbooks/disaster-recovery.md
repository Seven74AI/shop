# Disaster Recovery Runbook

> **Status:** Live document — update after every incident or rehearsal.
> **App:** shop-3ecf (production), shop-3ecf-staging (staging)
> **Last rehearsal:** pending

## Overview

This runbook covers five disaster scenarios, from most to least likely. Each scenario includes the **RTO** (Recovery Time Objective — how long until the service is usable again), **RPO** (Recovery Point Objective — maximum data loss in time), and step-by-step recovery instructions.

**When an incident occurs:**
1. ⛔ Stay calm. Don't panic-deploy.
2. 📋 Pick the matching scenario below.
3. ⏱️ Note the start time (for post-mortem).
4. 🔄 Follow steps in order. Don't skip verification steps.
5. 📝 Update the Incident Log at the bottom of this document afterward.

**Pre-requisites for all scenarios:**
- `flyctl` CLI installed and authenticated (`flyctl auth login`)
- Access to Tigris S3 credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- The `aws` CLI configured for Tigris:
  ```bash
  aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID
  aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY
  aws configure set region auto
  ```
- Tigris endpoint: `https://fly.storage.tigris.dev`
- GitHub repo access (to trigger workflows or revert commits)
- `sqlite3` CLI for database inspection

**Key identifiers:**

| Resource | Value |
|---|---|
| Production app | `shop-3ecf` |
| Staging app | `shop-3ecf-staging` |
| Primary region | `cdg` (Paris, France) |
| Fly.io org | (check with `flyctl orgs list`) |
| Backup bucket | `db-backups` (Tigris S3) |
| Daily backup time | 03:00 UTC |
| Backup retention | 30 days |

---

## Scenario 1: Total Production Region Outage

**Trigger:** Fly.io region `cdg` is down. The app is unreachable, `flyctl status --app shop-3ecf` shows all machines unhealthy or unreachable.

**RTO:** ~15 minutes (to deploy in a new region + restore backup)
**RPO:** Up to 24 hours (last daily backup; if backup ran recently, less)

> **Note on LiteFS replication:** LiteFS replicates within a single region only. There is no multi-region replica. If `cdg` is down, we lose access to the live database. The backup in Tigris S3 is our recovery point.

### Step 1: Confirm the outage is region-wide

```bash
# Check if it's just your connection
curl -I https://shop-3ecf.fly.dev

# Check Fly.io status page for cdg region
flyctl status --app shop-3ecf

# If machines show "started" but unreachable, the region network may be partially degraded
# Wait 5 minutes and retry before proceeding with failover
```

If the app is unreachable for >5 minutes, proceed.

### Step 2: Download the latest backup from Tigris

```bash
AWS_ENDPOINT="https://fly.storage.tigris.dev"
BUCKET="db-backups"

# List available backups
aws s3 ls s3://${BUCKET}/ \
  --endpoint-url "${AWS_ENDPOINT}" \
  | grep 'db-' \
  | sort -r \
  | head -5

# Download the latest
LATEST=$(aws s3 ls s3://${BUCKET}/ \
  --endpoint-url "${AWS_ENDPOINT}" \
  | grep 'db-' \
  | sort -r \
  | head -1 \
  | awk '{print $4}')

echo "Latest backup: $LATEST"

aws s3 cp "s3://${BUCKET}/${LATEST}" ./ \
  --endpoint-url "${AWS_ENDPOINT}"

gunzip "$LATEST"
# Produces: db-YYYY-MM-DD.sqlite

# Verify integrity
sqlite3 "${LATEST%.gz}" "PRAGMA integrity_check;"
# Expected: ok
```

### Step 3: Create a new Fly app in a different region

```bash
# Pick an available European region (fra, ams, lhr are good choices)
NEW_REGION="fra"

# Create a new app (flyctl will assign a name; note it down)
flyctl apps create --org personal --name shop-3ecf-failover

# Or create with a specific name
# flyctl apps create shop-3ecf-failover --org personal

# Set the primary region
flyctl regions set ${NEW_REGION} --app shop-3ecf-failover
```

### Step 4: Deploy the application to the new region

```bash
APP="shop-3ecf-failover"

# Copy secrets from production. Get them from 1Password or the original app:
# flyctl secrets list --app shop-3ecf

# Set ALL required secrets on the new app
flyctl secrets set \
  SESSION_SECRET="<from-vault>" \
  HONEYPOT_SECRET="<from-vault>" \
  RESEND_API_KEY="<from-vault>" \
  SENTRY_DSN="<from-vault>" \
  STRIPE_SECRET_KEY="<from-vault>" \
  STRIPE_WEBHOOK_SECRET="<from-vault>" \
  GITHUB_CLIENT_ID="<from-vault>" \
  GITHUB_CLIENT_SECRET="<from-vault>" \
  GITHUB_TOKEN="<from-vault>" \
  AWS_ACCESS_KEY_ID="<from-vault>" \
  AWS_SECRET_ACCESS_KEY="<from-vault>" \
  AWS_REGION="auto" \
  AWS_ENDPOINT_URL_S3="https://fly.storage.tigris.dev" \
  BUCKET_NAME="<from-vault>" \
  BACKUP_BUCKET_NAME="db-backups" \
  ALLOW_INDEXING="true" \
  --app "${APP}"

# Create a volume for LiteFS data
flyctl volumes create data --size 3 --region ${NEW_REGION} --app "${APP}"

# Deploy from the Docker image
flyctl deploy \
  --image "registry.fly.io/shop-3ecf:latest" \
  --app "${APP}" \
  --region ${NEW_REGION}
```

### Step 5: Upload the backup to the new app

Wait for the deploy to complete and the machine to start, then:

```bash
# Wait for the machine to be in "started" state
flyctl machine list --app "${APP}"

MACHINE_ID=$(flyctl machine list --app "${APP}" --json | jq -r '.[0].id')

# Stop the app process to prevent writes during restore
flyctl machine stop "${MACHINE_ID}" --app "${APP}"

# Upload the database via SFTP
echo "put db-YYYY-MM-DD.sqlite /litefs/data/sqlite.db" | \
  flyctl ssh sftp shell --app "${APP}" --machine "${MACHINE_ID}"

# Start the machine
flyctl machine start "${MACHINE_ID}" --app "${APP}"
```

### Step 6: Verify the failover app

```bash
# Check health
curl -s "https://${APP}.fly.dev/resources/healthcheck"
# Expected: {"status":"ok"}

# Check LiteFS health
curl -s "https://${APP}.fly.dev/litefs/health"
# Expected: {"ok":true}

# Browse the site and verify:
# - Products load on the homepage
# - Admin login works
# - Recent orders are visible in the admin dashboard
```

### Step 7: Update DNS and notify

If this is a prolonged outage, point the custom domain to the failover app:

```bash
# Add the custom domain to the failover app
flyctl certs create <your-domain> --app "${APP}"

# Update DNS A/AAAA records to point to Fly.io's anycast IPs
# A: 66.241.124.0/24
# AAAA: 2a09:8280:1::/24

# Notify the team via Slack
# Post in #incidents: "Production failover to ${NEW_REGION} complete. 
# App: https://${APP}.fly.dev | RTO: <time> | RPO: <backup date>"
```

### Step 8: Failback when cdg recovers

```bash
# Once cdg is operational again:
# 1. Export latest data from failover app
# 2. Import to production app
# 3. Verify production
# 4. Tear down failover app
flyctl apps destroy shop-3ecf-failover
```

---

## Scenario 2: Database Corruption

**Trigger:** Application errors indicate malformed data, `PRAGMA integrity_check` returns errors, or queries return unexpected results. May be detected by Sentry error spikes.

**RTO:** ~10 minutes
**RPO:** Up to 24 hours (latest backup)

### Step 1: Identify the corruption scope

```bash
APP="shop-3ecf"

# SSH into production and run integrity check
flyctl ssh console --app "${APP}" --command \
  'sqlite3 /litefs/data/sqlite.db "PRAGMA integrity_check;"'

# If errors are returned, note the specific tables/rows mentioned
# Common corruption indicators:
# - "row N missing from index"
# - "database disk image is malformed"
# - "file is not a database"
```

### Step 2: Stop the application (prevent further writes)

```bash
# SIGSTOP pauses the process; data in memory is preserved
flyctl ssh console --app "${APP}" --command \
  'kill -STOP $(pgrep -f "node")'
```

> If `pgrep` returns nothing or the process is already dead, skip to Step 3.

### Step 3: Download and verify the latest backup

```bash
# Follow the backup download steps from Scenario 1, Step 2
# Verify the backup's integrity separately:
sqlite3 db-YYYY-MM-DD.sqlite "PRAGMA integrity_check;"
# Must return "ok"

# Check row counts on critical tables:
for TABLE in User Product Order Cart OrderItem; do
  COUNT=$(sqlite3 db-YYYY-MM-DD.sqlite "SELECT COUNT(*) FROM ${TABLE};")
  echo "${TABLE}: ${COUNT}"
done
```

### Step 4: Replace the corrupted database

```bash
MACHINE_ID=$(flyctl machine list --app "${APP}" --json | jq -r '.[0].id')

# Stop the machine
flyctl machine stop "${MACHINE_ID}" --app "${APP}"

# Upload the clean backup
echo "put db-YYYY-MM-DD.sqlite /litefs/data/sqlite.db" | \
  flyctl ssh sftp shell --app "${APP}" --machine "${MACHINE_ID}"

# Set permissions
flyctl ssh console --app "${APP}" --machine "${MACHINE_ID}" --command \
  'chmod 644 /litefs/data/sqlite.db'

# Start the machine
flyctl machine start "${MACHINE_ID}" --app "${APP}"
```

### Step 5: Verify recovery

```bash
# Wait for health checks to pass (~30 seconds)
sleep 30

curl -s "https://${APP}.fly.dev/resources/healthcheck"
curl -s "https://${APP}.fly.dev/litefs/health"

# Verify frontend works
curl -s "https://${APP}.fly.dev" | head -20

# Run integrity check again to confirm
flyctl ssh console --app "${APP}" --command \
  'sqlite3 /litefs/data/sqlite.db "PRAGMA integrity_check;"'
```

### Step 6: Reconciliation

Data written between the last backup and the corruption moment is lost. Review:

1. **Stripe:** Compare recent charges in Stripe Dashboard with orders in the restored DB. Any charges without matching orders = user was charged but order is lost. Contact affected users and refund.
2. **User accounts:** New sign-ups since the backup are gone. Users will need to re-register.
3. **Manual entries:** Any admin actions (order status changes, product updates) since the backup are lost. Re-apply if needed.

---

## Scenario 3: Accidental Destructive Migration

**Trigger:** A Prisma migration that drops a table, removes a column, or corrupts data was deployed to production. This is the "I ran `prisma migrate deploy` and now orders are gone" scenario.

**RTO:** ~15 minutes (including deciding whether to rollback or restore)
**RPO:** 0 (if migration only affected schema, data may be intact) to 24 hours (if full restore needed)

### Decision Tree

```
Did the migration DROP data (columns, tables)?
├── YES → Restore from backup (Scenario 2, skip to Step 3)
└── NO (schema change only, app can't read existing data)
    └── Can you roll back the migration?
        ├── YES → Steps 1-4 below (fastest)
        └── NO (migration is irreversible) → Restore from backup
```

### Step 1: Identify which migration caused the issue

```bash
# Check recent deploys
flyctl releases --app shop-3ecf

# Check the migration history on the database
flyctl ssh console --app shop-3ecf --command \
  'sqlite3 /litefs/data/sqlite.db "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"'
```

Note the migration name (e.g., `20260520120000_drop_orders_table`).

### Step 2: Revert the application code (NOT the database yet)

```bash
# Option A: If auto-rollback caught it (fly.toml has auto_rollback = true)
flyctl releases --app shop-3ecf
# The previous release should already be running
# If not:

# Option B: Roll back the deploy manually
flyctl deploy --image "registry.fly.io/shop-3ecf:<previous-commit-sha>" --app shop-3ecf

# Option C: Revert the migration file on main, push, and redeploy
git revert <commit-with-bad-migration>
git push origin main
# CI will deploy automatically
```

### Step 3: If the migration was a schema-only change that didn't delete data

The database still has the old schema; reverting the app code is sufficient.

```bash
# Verify the data is intact
flyctl ssh console --app shop-3ecf --command \
  'sqlite3 /litefs/data/sqlite.db ".tables"'
# Confirm expected tables exist
```

### Step 4: If the migration deleted data (dropped table/column)

You MUST restore from backup. Follow Scenario 2, Step 3 onwards.

### Step 5: Prevent recurrence

```bash
# Consider adding --create-only to the migration workflow:
# In the future, generate migrations with:
# npx prisma migrate dev --create-only
# This lets you review the SQL before applying it

# Consider requiring PR approval for migrations that contain DROP
```

---

## Scenario 4: Credential Leak

**Trigger:** A secret is committed to the repository, exposed in logs, or leaked through any other channel.

**RTO:** ~30 minutes (dependent on number of credentials to rotate)
**RPO:** N/A (this is about preventing future misuse, not data recovery)

### Credential Inventory

Credentials are stored in two places:
1. **Fly.io secrets** — runtime environment variables set via `flyctl secrets set`
2. **GitHub Actions secrets** — CI/CD secrets used during deploy

| Secret | Location | Rotation Impact | Urgency |
|---|---|---|---|
| `SESSION_SECRET` | Fly.io secrets | Invalidates all user sessions | High |
| `HONEYPOT_SECRET` | Fly.io secrets | Honeypot fields break until rotated | Low |
| `STRIPE_SECRET_KEY` | Fly.io secrets | Payments fail until rotated | Critical |
| `STRIPE_WEBHOOK_SECRET` | Fly.io secrets | Webhooks fail until rotated | High |
| `RESEND_API_KEY` | Fly.io secrets | Emails fail (order confirmations, password resets) | High |
| `GITHUB_CLIENT_ID` | Fly.io secrets | GitHub OAuth login breaks | Medium |
| `GITHUB_CLIENT_SECRET` | Fly.io secrets | GitHub OAuth login breaks | High |
| `GITHUB_TOKEN` | Fly.io secrets | GitHub API calls fail (avatar loading) | Low |
| `SENTRY_DSN` | Fly.io secrets | Error tracking stops | Low |
| `SENTRY_AUTH_TOKEN` | GitHub Actions secrets | Source maps won't upload | Low |
| `AWS_ACCESS_KEY_ID` | Fly.io secrets | Object storage + backups fail | Critical |
| `AWS_SECRET_ACCESS_KEY` | Fly.io secrets | Object storage + backups fail | Critical |
| `INTERNAL_COMMAND_TOKEN` | Fly.io secrets (auto-generated) | Internal commands break | Medium |
| `MONDIAL_RELAY_API1_PRIVATE_KEY` | Fly.io secrets | Mondial Relay pickup search breaks | Medium |
| `MONDIAL_RELAY_API2_PASSWORD` | Fly.io secrets | Mondial Relay API v2 breaks | Medium |
| `FLY_API_TOKEN` | GitHub Actions secrets | Deployments fail | High |
| `SLACK_WEBHOOK_URL` | GitHub Actions vars | Backup failure alerts stop | Low |

### Rotation Order

Rotate in this order to minimize cascading failures:

#### 1. Stripe (Critical — payment processing)

```bash
# 1a. Go to Stripe Dashboard → Developers → API Keys
# 1b. Click "Roll key" on the secret key (creates new key, old key works for 24h)
# 1c. Copy the new secret key (starts with sk_live_)

# 1d. Update on Fly.io
flyctl secrets set STRIPE_SECRET_KEY="sk_live_<new-key>" --app shop-3ecf

# 1e. For webhook secret: Stripe Dashboard → Developers → Webhooks
#     Click the production webhook endpoint → "Roll secret"
#     Copy the new whsec_ key
flyctl secrets set STRIPE_WEBHOOK_SECRET="whsec_<new-secret>" --app shop-3ecf

# 1f. Redeploy to pick up secrets
flyctl deploy --app shop-3ecf
# OR restart machines (faster):
flyctl machine restart --app shop-3ecf $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')
```

#### 2. AWS / Tigris (Critical — storage + backups)

```bash
# 2a. Go to Tigris Console → Access Keys
# 2b. Create a new access key pair
# 2c. Delete the old key pair

# 2d. Update on Fly.io
flyctl secrets set \
  AWS_ACCESS_KEY_ID="<new-access-key>" \
  AWS_SECRET_ACCESS_KEY="<new-secret-key>" \
  --app shop-3ecf

flyctl machine restart --app shop-3ecf $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')

# 2e. Verify backups still work
flyctl ssh console --app shop-3ecf --command 'node /myapp/scripts/backup-db.cjs'
```

#### 3. Resend (High — transactional emails)

```bash
# 3a. Go to Resend Dashboard → API Keys
# 3b. Create a new API key
# 3c. Delete the old API key

# 3d. Update on Fly.io
flyctl secrets set RESEND_API_KEY="re_<new-key>" --app shop-3ecf
flyctl machine restart --app shop-3ecf $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')

# 3e. Send a test email (trigger a password reset or test order)
```

#### 4. Session Secrets (High — user sessions)

```bash
# 4a. Generate new secrets
NEW_SESSION_SECRET=$(openssl rand -hex 32)
NEW_HONEYPOT_SECRET=$(openssl rand -hex 32)

# 4b. Update on Fly.io
flyctl secrets set \
  SESSION_SECRET="${NEW_SESSION_SECRET}" \
  HONEYPOT_SECRET="${NEW_HONEYPOT_SECRET}" \
  --app shop-3ecf

flyctl machine restart --app shop-3ecf $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')

# 4c. NOTE: This invalidates ALL user sessions. All users must log in again.
#     Consider posting a notice on the site or sending an email to active users.
```

#### 5. GitHub OAuth (Medium — login)

```bash
# 5a. Go to GitHub → Settings → Developer Settings → OAuth Apps → Shop
# 5b. Click "Generate a new client secret"
# 5c. Copy the new secret

# 5d. Update on Fly.io
flyctl secrets set \
  GITHUB_CLIENT_SECRET="<new-client-secret>" \
  GITHUB_TOKEN="<new-personal-access-token>" \
  --app shop-3ecf

flyctl machine restart --app shop-3ecf $(flyctl machine list --app shop-3ecf --json | jq -r '.[0].id')
```

#### 6. GitHub Actions / Fly.io API Token (High — deployments)

```bash
# 6a. Go to Fly.io Dashboard → Account → Access Tokens
# 6b. Create a new token (or use: flyctl tokens create)
# 6c. Delete the old token

# 6d. Update in GitHub → Repo Settings → Secrets and Variables → Actions
#     Update FLY_API_TOKEN with the new value

# 6e. Trigger a test deploy to verify
```

#### 7. Remaining Secrets

```bash
# Sentry DSN: Go to Sentry → Project Settings → Client Keys (DSN)
#   Update via: flyctl secrets set SENTRY_DSN="<new-dsn>" --app shop-3ecf
#   Update SENTRY_AUTH_TOKEN in GitHub Actions secrets too

# Mondial Relay: Contact Mondial Relay support for key rotation
#   Update via: flyctl secrets set MONDIAL_RELAY_API1_PRIVATE_KEY="..." --app shop-3ecf

# INTERNAL_COMMAND_TOKEN: Auto-regenerated on next deploy
#   No manual rotation needed — it's generated in the Dockerfile

# SLACK_WEBHOOK_URL: Go to Slack App settings → Incoming Webhooks
#   Update in GitHub → Repo Settings → Secrets and Variables → Variables
```

---

## Scenario 5: PII Leak / Data Breach

**Trigger:** Personal data of EU residents has been exposed — accidental public endpoint, database dump in a public bucket, access logs leaked, or unauthorized data access detected.

**RTO:** 72 hours (GDPR Art. 33 deadline for notification to supervisory authority)
**RPO:** N/A

### GDPR Art. 33 Requirements

Under GDPR Article 33, as a data controller, you MUST:
1. Notify the **supervisory authority** within **72 hours** of becoming aware of the breach
2. Describe the nature of the breach, categories of data, and approximate number of records
3. Provide contact details of the DPO (Data Protection Officer) or responsible person
4. Describe likely consequences of the breach
5. Describe measures taken or proposed to address the breach

If the breach poses a **high risk** to individuals' rights and freedoms, you must ALSO notify the affected individuals **without undue delay** (Art. 34).

### Step 1: Contain the breach (first 30 minutes)

```bash
# Actions to take IMMEDIATELY:

# If data is exposed via a public endpoint:
#   1. Take down the endpoint or restrict access
#   2. If a route is leaking PII, comment it out and redeploy

# If data is in a public S3 bucket:
aws s3 ls s3://<bucket-name>/ --endpoint-url "https://fly.storage.tigris.dev"
#   Immediately make the bucket/object private in Tigris Console

# If database was accessed by an attacker:
#   1. Rotate all credentials (Scenario 4)
#   2. Check LiteFS access logs
flyctl logs --app shop-3ecf | grep -i "unauthorized\|error\|denied"

# If logs are leaking PII:
#   1. Check Sentry for exposed data in error reports
#   2. Check if request bodies are being logged to stdout
#      (see server/utils/monitoring.ts for Sentry PII filtering config)
```

### Step 2: Assess the scope (first 1-2 hours)

Document exactly what was exposed:

```markdown
## Breach Assessment — [DATE] [TIME] UTC

**What happened:**
[Describe how the breach was discovered, what system was affected]

**Data categories exposed:**
- [ ] Names
- [ ] Email addresses
- [ ] Physical addresses
- [ ] Phone numbers
- [ ] Order history (products purchased)
- [ ] Passwords (hashed? plaintext?)
- [ ] Payment information (full card numbers? last 4 digits?)
- [ ] IP addresses
- [ ] Session tokens

**Approximate number of records:** [N]
**Approximate number of affected individuals:** [N]
**Time period of exposure:** [start] to [end] UTC
**Is the data still accessible?** [Yes/No]
```

### Step 3: Notify the supervisory authority (within 72 hours)

The Shop app serves EU customers and is operated from France. The relevant authority is the **CNIL** (Commission Nationale de l'Informatique et des Libertés).

**CNIL breach notification portal:** https://www.cnil.fr/en/notify-data-breach

Required information for the notification:
1. **Controller:** The legal entity operating the Shop (company name, address)
2. **DPO contact:** Name and email of the data protection officer (if appointed)
3. **Breach description:** What happened, when, how discovered
4. **Data categories:** The list from Step 2
5. **Number of records/individuals:** Approximate counts
6. **Likely consequences:** Identity theft risk, financial fraud risk, reputational damage
7. **Measures taken:** Containment steps, credential rotation, user notification plan
8. **Measures planned:** Security improvements to prevent recurrence

If you cannot provide all information within 72 hours, submit an initial notification explaining the delay and follow up with details as they become available.

### Step 4: Notify affected individuals (if high risk)

Under Art. 34, you must notify affected individuals if the breach is likely to result in **high risk** to their rights and freedoms. This includes breaches of:
- Financial data (payment card numbers)
- Authentication credentials (passwords, even if hashed)
- Sensitive personal data (health, ethnicity, political opinions — unlikely for Shop)
- Data that could enable identity theft (name + address + email combinations)

**Notification template (email via Resend):**

```
Subject: Important Security Notice — Your Shop Account

Dear [Name],

We are writing to inform you of a security incident that may have involved 
your personal data on our Shop platform.

What happened: [brief description]

What data was involved: [specific data categories]

What we are doing: [containment, investigation, security improvements]

What you can do: [change password, monitor accounts, contact us]

We take the security of your data seriously and apologize for this incident.

If you have any questions, please contact us at [support email].

— The Shop Team
```

> **Important:** Do NOT send mass emails from the Shop's production Resend account if the breach involved Resend API key compromise. Use an alternative email provider for breach notifications in that case.

### Step 5: Post-incident actions

```bash
# 1. Preserve evidence
#    - Export relevant logs to a secure location
#    - Take screenshots of exposed data (for the authority)
#    - Document the timeline in the Incident Log

# 2. Fix the root cause
#    - If endpoint exposed: add authentication middleware
#    - If bucket was public: add bucket policy / block public access
#    - If code leaked secrets: add .env to .gitignore and rotate

# 3. Prevent recurrence
#    - Add a secret scanning pre-commit hook (e.g., detect-secrets, git-secrets)
#    - Enable GitHub secret scanning on the repository
#      (Settings → Security → Secret scanning)
#    - Review Sentry PII filtering:
#      Check server/utils/monitoring.ts — Sentry is configured to ignore 
#      healthcheck transactions. Review beforeSend for PII scrubbing.
#    - Set up alerting for unusual access patterns in Fly.io logs

# 4. Update this runbook with lessons learned
```

### Applicable Data in the Shop Database

Based on the Prisma schema, the Shop stores the following PII:

| Model | PII Fields | Retention |
|---|---|---|
| User | email, username, name | Until account deletion |
| Address | full address (street, city, postal code, country), phone | Until account deletion |
| Order | associated with User, contains shipping address copy | Per data-retention.md policy |
| Session | session tokens (hashed) | Auto-expire |
| Passkey | WebAuthn credentials | Until account deletion |
| Connection | OAuth connection data | Until disconnected |

See `docs/data-retention.md` for the full data retention policy.

---

## Incident Log

Record every actual incident or rehearsal here to build institutional knowledge.

| Date | Scenario | RTO (target) | RTO (actual) | RPO (target) | RPO (actual) | Outcome | Lessons |
|---|---|---|---|---|---|---|
| (pending) | (pending) | (pending) | (pending) | (pending) | (pending) | (pending) | (pending) |

---

## Related Documents

- [Backup & Restore Runbook](./backup-restore.md) — Daily backup details and restore procedure
- [Credential Rotation Runbook](./credential-rotation.md) — Full credential inventory and rotation procedures
- [Data Retention Policy](../data-retention.md) — How long different types of data are kept
- [Staging Environment](./staging.md) — How to test DR procedures in staging first

---

## Rehearsal Schedule

DR runbooks that are never tested are not runbooks — they're fan fiction.

| Scenario | Frequency | Last Rehearsal | Next Rehearsal |
|---|---|---|---|
| DB restore from backup | Monthly | — | (schedule ASAP) |
| Full region failover | Quarterly | — | (schedule) |
| Credential rotation drill | Bi-annually | — | (schedule) |
| PII breach tabletop | Annually | — | (schedule) |

> **Minimum requirement:** Restore from backup in staging at least once before considering this runbook complete. Update the Restore Test Record in `backup-restore.md`.
