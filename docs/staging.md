# Staging Environment

The Shop project has a staging environment on Fly.io for pre-production testing.
Push to `dev` branch triggers a deploy to staging with automated smoke tests.

## Architecture

| Environment | Fly App | URL | Config |
|-------------|---------|-----|--------|
| Production | `shop-3ecf` | `shop-3ecf.fly.dev` | `fly.toml` |
| Staging | `shop-3ecf-staging` | `shop-3ecf-staging.fly.dev` | `fly.staging.toml` |

The staging environment runs the same Docker image as production (`other/Dockerfile`)
but with:
- Separate Fly app + database (isolated data)
- Separate Tigris bucket (`shop-3ecf-staging`)
- Reduced concurrency limits (25 hard / 20 soft vs 100/80 on prod)
- Search engine indexing disabled (`ALLOW_INDEXING=false`)
- Stripe test mode keys
- GitHub OAuth redirect pointing to staging URL

## Initial Setup (one-time)

### 1. Create the staging Fly app

```bash
fly apps create shop-3ecf-staging --org personal
fly volumes create data --size 1 --region cdg -c fly.staging.toml
```

### 2. Set staging secrets

```bash
fly secrets set \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  HONEYPOT_SECRET="$(openssl rand -hex 32)" \
  INTERNAL_COMMAND_TOKEN="$(openssl rand -hex 32)" \
  RESEND_API_KEY="re_your_staging_key" \
  STRIPE_SECRET_KEY="sk_test_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  AWS_ACCESS_KEY_ID="..." \
  AWS_SECRET_ACCESS_KEY="..." \
  -c fly.staging.toml
```

### 3. Create a GitHub OAuth App for staging

Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App.
- Application name: `Shop (Staging)`
- Homepage URL: `https://shop-3ecf-staging.fly.dev`
- Authorization callback URL: `https://shop-3ecf-staging.fly.dev/auth/github/callback`

Set the client ID and secret:
```bash
fly secrets set \
  GITHUB_CLIENT_ID="..." \
  GITHUB_CLIENT_SECRET="..." \
  -c fly.staging.toml
```

### 4. Set the Fly API token in GitHub

Add `FLY_API_TOKEN` to the repository secrets (Settings → Secrets and variables → Actions):
1. Generate a token: `flyctl auth token`
2. Add it as `FLY_API_TOKEN` in GitHub repo secrets

### 5. First deploy

```bash
fly deploy -c fly.staging.toml
```

## Automated Deploy (CI)

The `.github/workflows/staging-deploy.yml` workflow triggers automatically on:
- Push to `dev` branch
- Manual trigger via `workflow_dispatch`

### Pipeline steps

1. **ci-gate** — Waits for main CI checks (lint, typecheck, vitest, playwright-gate) to pass
2. **build** — Builds and pushes the Docker image to Fly registry with the commit SHA
3. **deploy** — Deploys the built image to the staging Fly app
4. **smoke-tests** — Runs HTTP smoke tests against the staging URL

### Smoke tests

After deploy, the workflow verifies:
- `/resources/healthcheck` returns 200
- Homepage (`/`) returns 200
- Products page (`/products`) returns 200
- Search endpoint (`/resources/search?q=test`) is accessible

If any smoke test fails, the workflow fails and the PR shows a red status.

## Manual Deploy

```bash
# Deploy current branch to staging
fly deploy -c fly.staging.toml

# Deploy a specific image
fly deploy \
  --config fly.staging.toml \
  --image "registry.fly.io/shop-3ecf-staging:<commit-sha>" \
  --app shop-3ecf-staging
```

## Viewing Logs

```bash
# Staging app logs
fly logs -c fly.staging.toml

# Production app logs
fly logs -c fly.toml
```

## SSH into Staging

```bash
fly ssh console -c fly.staging.toml

# Connect to database
sqlite3 /litefs/data/sqlite.db

# Check running processes
ps aux
```

## Running Tests Against Staging

```bash
# Smoke tests (manual)
STAGING_URL="https://shop-3ecf-staging.fly.dev"

# Health check
curl -sS "$STAGING_URL/resources/healthcheck"

# Homepage
curl -sS "$STAGING_URL/"

# Products
curl -sS "$STAGING_URL/products"

# With Playwright (local)
PLAYWRIGHT_TEST_BASE_URL="$STAGING_URL" npx playwright test tests/e2e/smoke/
```

## Environment Variables

See `.env.staging` for the full list of staging environment variables.
Most are set via `fly secrets` on the staging app.

### Key differences from production

| Variable | Staging Value | Production Value |
|----------|---------------|------------------|
| `NODE_ENV` | `staging` | `production` |
| `ALLOW_INDEXING` | `false` | `true` |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` (never committed) |
| `MOCKS` | `true` (default) | `false` |
| `BUCKET_NAME` | `shop-3ecf-staging` | `shop-3ecf` |

## Cleaning Up

The staging database and volumes are ephemeral — they can be reset at any time:

```bash
# Reset staging database
fly volumes delete data -c fly.staging.toml --yes
fly volumes create data --size 1 --region cdg -c fly.staging.toml
fly deploy -c fly.staging.toml
```
