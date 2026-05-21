#!/bin/bash
set -euo pipefail
cd /root/.hermes/kanban/boards/shop/workspaces/t_4b967237

export CI=true MOCKS=true PORT=8812

echo "=== Killing old servers ==="
pkill -f "shop dev" 2>/dev/null || true
sleep 1

echo "=== Starting dev server ==="
pnpm dev --port $PORT > /tmp/dev-server.log 2>&1 &
DEV_PID=$!

# Wait for server to be ready (any HTTP response)
for i in $(seq 1 30); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/ 2>/dev/null || echo "000")
    if [ "$STATUS" != "000" ]; then
        echo "Server UP (HTTP $STATUS) after ${i}s"
        break
    fi
    sleep 1
done

echo "=== Running i18n tests ==="
npx playwright test tests/e2e/i18n.spec.ts --reporter=line 2>&1 | tee /tmp/i18n-result.txt
RC=${PIPESTATUS[0]}
echo "Exit code: $RC"

echo "=== Server log tail ==="
tail -20 /tmp/dev-server.log

kill $DEV_PID 2>/dev/null || true
exit 0
