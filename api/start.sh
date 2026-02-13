#!/bin/sh
set -e

echo "[Startup] Initializing database..."
npm run init-db

echo "[Startup] Running migrations..."
node migrate.js

echo "[Startup] Starting API server..."
node server.js &
SERVER_PID=$!

# Wait for server to be ready
echo "[Startup] Waiting for API to be ready..."
until nc -z localhost 3000; do
  sleep 1
done

echo "[Startup] API is ready. Running initial product indexing..."
node worker/jobs/indexProducts.js || echo "[Startup] Warning: Initial indexing failed (merchants may not be set up yet)"

echo "[Startup] Startup complete. API running."

# Keep server running
wait $SERVER_PID
