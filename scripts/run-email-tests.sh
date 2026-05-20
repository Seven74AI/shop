#!/bin/bash
set -e
cd /root/.hermes/kanban/boards/shop/workspaces/t_152459a4

# Ensure test environment
export LITEFS_DIR=/tmp/litefs-test
export DATABASE_URL="file:/tmp/shop-test/data.db"
export CACHE_DATABASE_PATH="/tmp/shop-test/cache.db"
export CI=true
export MOCKS=true
export NODE_ENV=test
export SESSION_SECRET=test-secret
export INTERNAL_COMMAND_TOKEN=test-token
export HONEYPOT_SECRET=test-honeypot
export DATABASE_PATH=/tmp/shop-test/data.db

# Pre-create cache table
mkdir -p /tmp/shop-test /tmp/litefs-test
echo "test-instance-1" > /tmp/litefs-test/.primary
echo "test-instance-1" > /tmp/litefs-test/.current

# Create cache db if not exists
if ! node --experimental-sqlite -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/tmp/shop-test/cache.db');
db.exec('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, metadata TEXT, value TEXT)');
console.log('cache table ready');
"; then
  echo "creating fresh cache.db"
  rm -f /tmp/shop-test/cache.db
  node --experimental-sqlite -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/tmp/shop-test/cache.db');
db.exec('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, metadata TEXT, value TEXT)');
console.log('cache table ready');
"
fi

echo "=== Running abandoned cart email tests ==="
npx vitest run app/utils/abandoned-cart-email.server.test.tsx 2>&1
echo "EXIT_CODE: $?"
echo "=== DONE ==="
