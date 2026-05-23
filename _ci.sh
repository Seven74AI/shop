#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_3dec9c2e

echo "=== INSTALLING DEPS ==="
CI=true pnpm approve-builds @prisma/engines prisma esbuild sharp @sentry/cli 2>&1 | tail -3
pnpm install --frozen-lockfile 2>&1 | tail -5
echo "install done"

echo "=== PRISMA GENERATE ==="
pnpm exec prisma generate 2>&1 | tail -3
pnpm exec prisma generate --sql 2>&1 | tail -3
echo "prisma generate done"

echo "=== VITEST ==="
CI=true pnpm vitest run 2>&1 | tail -25
echo "vitest exit: $?"

echo "=== TYPECHECK ==="
pnpm run typecheck 2>&1 | tail -20
echo "typecheck exit: ${PIPESTATUS[0]}"

echo "=== LINT ==="
pnpm run lint 2>&1 | tail -20
echo "lint exit: ${PIPESTATUS[0]}"

echo "=== CI COMPLETE ==="
