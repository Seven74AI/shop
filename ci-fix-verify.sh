#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_4cd1cf08

echo "=== BUILD ==="
pnpm run build 2>&1 | tail -5

echo "=== VITEST ==="
pnpm vitest run 2>&1 | tail -10
echo "VITEST_EXIT=$?"

echo "=== TYPECHECK ==="
pnpm run typecheck 2>&1 | tail -10
echo "TSC_EXIT=$?"

echo "=== LINT ==="
pnpm run lint 2>&1 | tail -5
echo "LINT_EXIT=$?"

echo "=== PLAYWRIGHT (subset) ==="
# Run a quick subset to validate the fix works
MOCKS=true pnpm exec playwright test \
  tests/e2e/shop.test.ts \
  tests/e2e/cart.test.ts \
  tests/e2e/checkout.test.ts \
  tests/e2e/feature-flags.test.ts \
  --workers=1 2>&1 | tail -20
echo "PW_EXIT=$?"

echo "DONE"
