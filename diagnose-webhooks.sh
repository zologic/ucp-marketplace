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

echo "=== Webhook Diagnostics ==="
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

# Check checkout sessions
echo ""
echo "2. Checking checkout sessions..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    status,
    COUNT(*) as count,
    MAX(created_at) as latest
FROM checkout_sessions
GROUP BY status
ORDER BY status;
"

# Check orders with referral_id
echo ""
echo "3. Checking orders (webhook-created)..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    COUNT(*) as total_orders,
    COUNT(referral_id) as orders_with_referral_id,
    MAX(created_at) as latest_order
FROM orders;
"

# Check recent orders
echo ""
echo "4. Recent orders (last 10)..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    id,
    referral_id,
    merchant_order_id,
    revenue_cents / 100.0 as revenue_eur,
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
    referral_source
FROM orders
ORDER BY created_at DESC
LIMIT 10;
"

# Check for pending checkout sessions (created but not completed)
echo ""
echo "5. Pending checkout sessions (created but no webhook)..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    cs.referral_id,
    cs.status,
    cs.referral_source,
    TO_CHAR(cs.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
    CASE
        WHEN o.id IS NOT NULL THEN 'Has order'
        ELSE 'No order yet'
    END as webhook_status
FROM checkout_sessions cs
LEFT JOIN orders o ON o.referral_id = cs.referral_id
WHERE cs.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY cs.created_at DESC
LIMIT 10;
"

# Check merchants with/without public keys
echo ""
echo "6. Merchant verification status..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    COUNT(*) as total_merchants,
    COUNT(public_key) as verified_merchants,
    COUNT(*) - COUNT(public_key) as unverified_merchants
FROM merchants;
"

# Check API logs for webhook activity
echo ""
echo "7. Recent webhook logs (last 20 lines)..."
docker compose logs api --tail 20 | grep -i webhook || echo "   (No webhook logs found)"

# Check if API is running
echo ""
echo "8. API container status..."
docker compose ps api

echo ""
echo "=== Diagnostics Complete ==="
echo ""
echo "Troubleshooting tips:"
echo "  - If no orders exist: Webhooks are not being sent by merchants"
echo "  - If checkout sessions exist but no orders: Webhooks not arriving or failing"
echo "  - If merchants unverified (no public_key): Run merchant verification first"
echo "  - Check API logs for webhook errors: docker compose logs api | grep webhook"
echo ""
echo "To test webhook manually:"
echo "  node test-webhook.js"
echo ""
