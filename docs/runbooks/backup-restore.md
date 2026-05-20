# Database Backup & Restore Runbook

## Overview

The Shop database (SQLite via LiteFS) is backed up daily at 3am UTC to a Tigris S3 bucket (`db-backups`). Backups are retained for 30 days.

The backup workflow runs via GitHub Actions (`.github/workflows/db-backup.yml`), which SSHs into the production Fly machine and executes `scripts/backup-db.js`.

## Backup Details

- **Schedule:** Daily at 03:00 UTC
- **Format:** Gzip-compressed SQLite snapshot (`db-YYYY-MM-DD.sqlite.gz`)
- **Storage:** Tigris S3 bucket (`BACKUP_BUCKET_NAME` = `db-backups`)
- **Retention:** 30 days. Older backups are automatically pruned after each successful backup.
- **Snapshot method:** `litefs export -name <db> <path>` — produces a transactionally consistent snapshot without pausing the primary.

## Prerequisites for Restore

- `flyctl` CLI installed and authenticated (`flyctl auth login`)
- Access to Tigris S3 credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- The `aws` CLI (or any S3-compatible tool) configured for Tigris:
  ```bash
  aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID
  aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY
  aws configure set region auto
  ```
- Tigris endpoint: `https://fly.storage.tigris.dev`

## Restore Procedure

### Step 1: Identify the backup to restore

List available backups in the Tigris bucket:

```bash
AWS_ENDPOINT_URL_S3="https://fly.storage.tigris.dev"
BUCKET="db-backups"

aws s3 ls s3://${BUCKET}/ \
  --endpoint-url "${AWS_ENDPOINT_URL_S3}" \
  | grep 'db-' \
  | sort
```

Pick the most recent backup, or a specific date: `db-2026-05-20.sqlite.gz`

### Step 2: Download the backup

```bash
BACKUP_KEY="db-2026-05-20.sqlite.gz"

aws s3 cp "s3://${BUCKET}/${BACKUP_KEY}" ./ \
  --endpoint-url "${AWS_ENDPOINT_URL_S3}"
```

### Step 3: Decompress

```bash
gunzip db-2026-05-20.sqlite.gz
# Produces: db-2026-05-20.sqlite
```

### Step 4: Verify integrity

```bash
sqlite3 db-2026-05-20.sqlite "PRAGMA integrity_check;"
# Expected output: ok

# Check row counts on key tables
sqlite3 db-2026-05-20.sqlite "SELECT COUNT(*) FROM User;"
sqlite3 db-2026-05-20.sqlite "SELECT COUNT(*) FROM Product;"
sqlite3 db-2026-05-20.sqlite "SELECT COUNT(*) FROM Order;"
```

### Step 5: Stop the application

SSH into the production machine and stop the app to prevent writes during restore:

```bash
APP="shop-3ecf"

flyctl ssh console --app "${APP}" --command 'kill -STOP $(pgrep -f "node")'
```

> **Note:** `kill -STOP` pauses the process without terminating it. After restore, use `kill -CONT` to resume.

### Step 6: Upload the backup to the Fly volume

Copy the restored database to the Fly volume:

```bash
flyctl ssh sftp shell --app "${APP}"
# In the SFTP shell:
put db-2026-05-20.sqlite /litefs/data/sqlite.db
```

Or using `flyctl ssh console` with a pipe:

```bash
cat db-2026-05-20.sqlite | \
  flyctl ssh console --app "${APP}" \
    --command 'dd of=/litefs/data/sqlite.db'
```

### Step 7: Set proper permissions

```bash
flyctl ssh console --app "${APP}" --command 'chmod 644 /litefs/data/sqlite.db'
```

### Step 8: Restart LiteFS

LiteFS needs to pick up the replaced database:

```bash
flyctl ssh console --app "${APP}" --command 'kill -CONT $(pgrep -f "node")'
```

If the above doesn't work (process may have terminated), restart the machine:

```bash
flyctl machine restart --app "${APP}" <machine-id>
```

### Step 9: Verify the application is healthy

```bash
# Check Fly.io status
flyctl status --app "${APP}"

# Hit the healthcheck endpoint
curl -s "https://${APP}.fly.dev/resources/healthcheck"
# Expected: {"status":"ok"}

# Verify LiteFS health
curl -s "https://${APP}.fly.dev/litefs/health"
# Expected: {"ok":true}
```

### Step 10: Test critical functionality

1. Browse the shop frontend — verify products load
2. Log in as an admin — verify dashboard works
3. Check a recent order — verify order data is intact

## Manual Backup (Ad-hoc)

To run a backup outside the scheduled window:

```bash
APP="shop-3ecf"
flyctl ssh console --app "${APP}" --command 'node /myapp/scripts/backup-db.js'
```

Or trigger the GitHub Actions workflow manually:
- Go to Actions → "Database Backup" → "Run workflow"

## Troubleshooting

### Backup fails with "litefs: command not found"
The `litefs` binary is at `/usr/local/bin/litefs`. Ensure the Docker image was built with the LiteFS copy step.

### Backup fails with "Missing required environment variable"
Ensure the Fly machine has these environment variables set:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (set to `auto`)
- `AWS_ENDPOINT_URL_S3` (set to `https://fly.storage.tigris.dev`)
- `BACKUP_BUCKET_NAME` (set to `db-backups`)
- `DATABASE_PATH` (set to `/litefs/data/sqlite.db` — default)

Set them via:
```bash
flyctl secrets set --app "${APP}" AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
```

### Integrity check fails after restore
If `PRAGMA integrity_check` returns errors, the backup file may be corrupted. Try an earlier backup.

### Application doesn't start after restore
Check LiteFS logs:
```bash
flyctl logs --app "${APP}"
```

If LiteFS fails to mount, the database may have been corrupted during copy. Re-upload the backup and restart.

## Restore Test Record

| Date       | Backup Used          | Integrity Check | App Healthy | Tester | Notes |
|------------|---------------------|-----------------|-------------|--------|-------|
| (pending)  | (pending)           | (pending)       | (pending)   | (pending) | Initial restore test |

> **IMPORTANT:** Update this table after every restore test. Untested backups are not real backups.
