#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_89bbc882

echo "=== INSTALL ==="
pnpm install --no-frozen-lockfile 2>&1 | tail -5

echo "=== TYPECHECK ==="
pnpm typecheck 2>&1
echo "TYPECHECK_EXIT=$?"

echo "=== VITEST SEO ==="
CI=true npx vitest run --config vitest.seo.config.ts 2>&1
echo "VITEST_EXIT=$?"

echo "=== DONE ==="
