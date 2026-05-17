#!/bin/bash
cd /tmp/shop-original
set -a
source .env
set +a
export PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000
export NODE_ENV=production
export MOCKS=true
exec node ./server-build/index.js
