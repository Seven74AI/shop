#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_4cd1cf08
REPORT="/tmp/ci-local-report.json"

echo "=== INSTALLING DEPS ==="
pnpm install --frozen-lockfile 2>&1 | tail -5
echo "INSTALL_OK"

echo "=== PRISMA GENERATE ==="
pnpm exec prisma generate 2>&1 | tail -5
pnpm exec prisma generate --sql 2>&1 | tail -5
echo "PRISMA_OK"

echo "=== VITEST ==="
pnpm vitest run --reporter=json --outputFile=/tmp/vitest-report.json 2>&1 | tail -20
VITEST_EXIT=$?
echo "VITEST_EXIT=$VITEST_EXIT"

echo "=== TYPECHECK ==="
pnpm run typecheck 2>&1 | tail -20
TSC_EXIT=$?
echo "TSC_EXIT=$TSC_EXIT"

echo "=== LINT ==="
pnpm run lint 2>&1 | tail -20
LINT_EXIT=$?
echo "LINT_EXIT=$LINT_EXIT"

echo "=== PLAYWRIGHT E2E (only failing tests from CI) ==="
# Run only the tests that failed in CI, with workers=1
pnpm exec playwright test --workers=1 \
  tests/e2e/cart.test.ts \
  tests/e2e/cart-badge.test.ts \
  tests/e2e/checkout.test.ts \
  tests/e2e/category.test.ts \
  tests/e2e/feature-flags.test.ts \
  tests/e2e/error-boundary.test.ts \
  tests/e2e/shop.test.ts \
  tests/e2e/newsletter.test.ts \
  tests/e2e/a11y.test.ts \
  --reporter=json 2>&1 | tail -30
PW_EXIT=$?
echo "PW_EXIT=$PW_EXIT"

# Summary
echo "{\"vitest\": $VITEST_EXIT, \"tsc\": $TSC_EXIT, \"lint\": $LINT_EXIT, \"playwright\": $PW_EXIT}" > "$REPORT"
echo "DONE"
