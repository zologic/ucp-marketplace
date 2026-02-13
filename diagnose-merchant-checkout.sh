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

# Diagnostic script to check merchant's embedded checkout capability

MERCHANT_DOMAIN=${1:-"test.zologic.nl"}

echo "=== Merchant Embedded Checkout Diagnostics ==="
echo ""
echo "Checking merchant: $MERCHANT_DOMAIN"
echo ""

# Check merchant record in database
echo "1. Database merchant record:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" ucpready -c "
SELECT
    id,
    domain,
    status,
    ucp_endpoint,
    business_name,
    service_base_url,
    last_verified_at,
    jsonb_pretty(ucp_manifest->'capabilities') as capabilities
FROM merchants
WHERE domain = '$MERCHANT_DOMAIN';
" 2>/dev/null

echo ""
echo "2. Embedded checkout capability details:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" ucpready -t -c "
SELECT
    jsonb_pretty(
        (
            SELECT jsonb_agg(cap)
            FROM merchants m,
            jsonb_array_elements(m.ucp_manifest->'capabilities') as cap
            WHERE m.domain = '$MERCHANT_DOMAIN'
            AND cap->>'name' LIKE '%embedded_checkout%'
        )
    ) as embedded_checkout_capability;
" 2>/dev/null

echo ""
echo "3. Fetching live UCP manifest from merchant:"
UCP_ENDPOINT="https://$MERCHANT_DOMAIN/.well-known/ucp"
echo "   Endpoint: $UCP_ENDPOINT"
echo ""

curl -s "$UCP_ENDPOINT" | jq '.capabilities[] | select(.name | contains("embedded_checkout"))' 2>/dev/null || echo "   ✗ No embedded_checkout capability found in live manifest"

echo ""
echo "=== Recommendations ==="
echo ""
echo "If embedded_checkout capability is missing:"
echo "  1. Merchant needs to add it to their UCP manifest"
echo "  2. Run: docker compose exec api node -e \"require('./worker/jobs/verifyMerchants').verifyMerchants(require('pg').Pool({connectionString: process.env.DATABASE_URL})).then(console.log)\""
echo ""
echo "If embedded_checkout capability exists but not in database:"
echo "  1. Merchant verification hasn't run yet"
echo "  2. Run verification manually (command above)"
echo ""
