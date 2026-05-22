#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_3659b24a

echo "=== LINT ==="
pnpm run lint 2>&1; LINT_RC=$?
echo "LINT_EXIT=$LINT_RC"

echo "=== TYPECHECK ==="
pnpm run typecheck 2>&1; TC_RC=$?
echo "TC_EXIT=$TC_RC"

echo "=== VITEST (json-ld + sitemap) ==="
npx vitest run app/utils/json-ld.server.test.ts app/utils/sitemap.server.test.ts 2>&1; VITEST_RC=$?
echo "VITEST_EXIT=$VITEST_RC"

echo "=== SUMMARY ==="
echo "LINT=$LINT_RC TYPECHECK=$TC_RC VITEST=$VITEST_RC"
