#!/bin/bash
set -a
source /tmp/shop-original/.env
set +a
export PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000
export NODE_ENV=production
export MOCKS=true
cd /tmp/shop-original
exec node ./server-build/index.js
