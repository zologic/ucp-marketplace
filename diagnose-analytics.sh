#!/bin/bash

# Get database configuration from environment or defaults
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-ucpready}

# Load from .env if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

echo "=== Analytics Diagnostics ==="
echo "Database: $POSTGRES_DB"
echo ""

# Check if database is accessible
echo "1. Checking database connection..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Database accessible"
else
    echo "✗ Database not accessible"
    exit 1
fi

# Check if events tables have data
echo ""
echo "2. Checking event data..."
echo "   Search events:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) as count, MAX(created_at) as latest FROM search_events;" -t

echo "   Click events:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) as count, MAX(created_at) as latest FROM click_events;" -t

echo "   Checkout sessions:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) as count, MAX(created_at) as latest FROM checkout_sessions;" -t

echo "   Orders:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) as count, MAX(created_at) as latest FROM orders;" -t

# Check if merchant_daily_stats has data
echo ""
echo "3. Checking aggregated stats..."
echo "   merchant_daily_stats rows:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest FROM merchant_daily_stats;" -t

echo "   Sample of recent stats:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT date, SUM(search_count) as searches, SUM(click_count) as clicks, SUM(revenue_cents) as revenue FROM merchant_daily_stats GROUP BY date ORDER BY date DESC LIMIT 7;"

# Check if worker is configured to run
echo ""
echo "4. Manual rollup for today (testing)..."
docker compose exec -T api node -e "
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const { rollupStats } = require('/app/worker/jobs/rollupStats.js');
rollupStats(db).then(result => {
    console.log('Rollup result:', result);
    process.exit(0);
}).catch(err => {
    console.error('Rollup failed:', err);
    process.exit(1);
});
"

echo ""
echo "5. Checking for missing merchant_ids in events..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    'search_events' as table_name,
    COUNT(*) as total,
    COUNT(merchant_id) as with_merchant_id,
    COUNT(*) - COUNT(merchant_id) as missing_merchant_id
FROM search_events
UNION ALL
SELECT
    'click_events',
    COUNT(*),
    COUNT(merchant_id),
    COUNT(*) - COUNT(merchant_id)
FROM click_events;
"

echo ""
echo "=== Diagnostics Complete ==="
echo ""
echo "If merchant_daily_stats is empty but events exist, run:"
echo "  docker compose exec api node /app/worker/index.js"
echo "  (Or ensure the worker service is running in the background)"
