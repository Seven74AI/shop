#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_af3ad351

echo "=== Step 1: Prisma generate (skip if already done) ==="
if [ -f node_modules/.prisma/client/index.js ]; then
    echo "Prisma client already generated."
else
    npx prisma generate 2>&1
fi

echo "=== Step 2: Run review tests ==="
CI=true pnpm vitest run app/routes/admin+/reviews+/ --reporter=verbose 2>&1
EXIT=$?

echo "=== Step 3: Check for type errors in review routes ==="
npx tsc --noEmit --pretty 2>&1 | grep -i "admin+/reviews" || echo "No type errors in review routes"
TYPE_EXIT=${PIPESTATUS[0]}

echo "=== RESULTS ==="
echo "VITEST_EXIT=$EXIT"
echo "TYPECHECK_EXIT=$TYPE_EXIT"
echo "=== DONE ==="
