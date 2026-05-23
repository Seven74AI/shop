#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_af3ad351

echo "=== TYPECHECK ==="
pnpm run typecheck 2>&1 | tail -100
echo "=== TYPECHECK_EXIT: $? ==="

echo "=== VITEST ==="
npx vitest run --reporter=verbose 2>&1 | tail -200
echo "=== VITEST_EXIT: $? ==="

echo "=== LINT ==="
pnpm run lint 2>&1 | tail -50
echo "=== LINT_EXIT: $? ==="