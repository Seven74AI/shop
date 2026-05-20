#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_ecb7ade4/shop

# Ensure test environment
export LITEFS_DIR=/tmp/litefs-test
export DATABASE_URL=file:/tmp/shop-test/data.db
export CACHE_DATABASE_PATH=/tmp/shop-test/cache.db
export CI=true
export MOCKS=true
export NODE_ENV=test

# Pre-create cache table to workaround litefs-js / remember() race
mkdir -p /tmp/shop-test /tmp/litefs-test
echo "test-instance-1" > /tmp/litefs-test/.primary
echo "test-instance-1" > /tmp/litefs-test/.current

# Pre-create cache.db with table
rm -f /tmp/shop-test/cache.db
node --experimental-sqlite -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/tmp/shop-test/cache.db');
db.exec('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, metadata TEXT, value TEXT)');
console.log('cache table ready');
"

echo "=== Running circuit breaker tests ==="
npx vitest run --config vitest.circuit-breaker.config.ts 2>&1
echo "EXIT_CB: $?"

echo "=== Running API1 tests ==="
npx vitest run app/utils/carriers/mondial-relay-api1.server.test.ts 2>&1
echo "EXIT_API1: $?"

echo "=== Running API2 tests ==="
npx vitest run app/utils/carriers/mondial-relay-api2.server.test.ts 2>&1
echo "EXIT_API2: $?"

echo "=== Running tsc typecheck ==="
npx tsc --noEmit 2>&1 | head -80
echo "EXIT_TSC: ${PIPESTATUS[0]}"

echo "=== Running lint ==="
npx eslint app/utils/circuit-breaker.server.ts app/utils/circuit-breaker.server.test.ts app/utils/carriers/mondial-relay-api1.server.ts app/utils/carriers/mondial-relay-api2.server.ts 2>&1 | head -80
echo "EXIT_LINT: ${PIPESTATUS[0]}"

echo "=== ALL DONE ==="
