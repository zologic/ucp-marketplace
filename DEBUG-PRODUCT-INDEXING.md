# Product Indexing Debug Guide

## Problem
Products from merchant `test.zologic.nl` are not appearing in the database.

## Root Cause
Products are only indexed when:
1. The merchant has a valid UCP manifest with `dev.ucp.shopping.products` capability
2. The merchant has `service_base_url` configured
3. The indexing job has run (runs automatically every 6 hours, or manually triggered)

## Debugging Steps

### Step 1: Check Merchant Configuration
```bash
docker compose exec postgres psql -U postgres ucpready -c "
SELECT
    domain,
    service_base_url,
    ucp_manifest IS NOT NULL as has_manifest,
    last_indexed_at
FROM merchants
WHERE domain = 'test.zologic.nl';
"
```

**Expected:** `service_base_url` should be set, `has_manifest` should be `t` (true)

### Step 2: Check Products Capability in Manifest
```bash
docker compose exec postgres psql -U postgres ucpready -c "
SELECT
    domain,
    jsonb_pretty(ucp_manifest->'capabilities') as capabilities
FROM merchants
WHERE domain = 'test.zologic.nl';
"
```

**Expected:** Should see a capability object with `name: 'dev.ucp.shopping.products'` and `supported: true`

### Step 3: Check Indexing Log
```bash
docker compose exec postgres psql -U postgres ucpready -c "
SELECT
    mil.started_at,
    mil.completed_at,
    mil.status,
    mil.products_indexed,
    mil.products_failed,
    mil.error_code,
    mil.error_message
FROM merchant_index_log mil
JOIN merchants m ON mil.merchant_id = m.id
WHERE m.domain = 'test.zologic.nl'
ORDER BY mil.started_at DESC
LIMIT 5;
"
```

**Possible outcomes:**
- **No rows**: Indexing job hasn't run yet (waits 6 hours)
- **status='failed'**: Check `error_code` and `error_message` for details
- **status='success' but products_indexed=0**: Products endpoint returned empty array

### Step 4: Manually Trigger Indexing
Don't wait 6 hours - trigger it now:

```bash
docker compose exec worker node /app/trigger-index.js
```

Watch the output for errors. The script will show:
- How many merchants were found for indexing
- Products endpoint being called
- Number of products indexed per merchant
- Any errors that occurred

### Step 5: Check Products After Indexing
```bash
docker compose exec postgres psql -U postgres ucpready -c "
SELECT
    p.id,
    p.name,
    p.has_variations,
    p.indexed_at,
    p.stock_status
FROM products p
JOIN merchants m ON p.merchant_id = m.id
WHERE m.domain = 'test.zologic.nl'
LIMIT 10;
"
```

## Common Issues

### Issue: "NO_PRODUCTS_CAPABILITY" error
**Cause:** Merchant's UCP manifest doesn't declare products capability
**Fix:** Add to merchant's manifest:
```json
{
  "capabilities": [
    {
      "name": "dev.ucp.shopping.products",
      "supported": true,
      "endpoint": "https://test.zologic.nl/wp-json/ucp/v1/products"
    }
  ]
}
```

### Issue: "ENDPOINT_NOT_FOUND" error
**Cause:** Products endpoint URL is wrong or returns 404
**Fix:** Verify the endpoint works:
```bash
curl -v https://test.zologic.nl/wp-json/ucp/v1/products?limit=5
```

### Issue: Products indexed but not showing in search
**Cause:** Search uses full-text search on `search_vector` field
**Debug:** Check if search_vector was populated:
```bash
docker compose exec postgres psql -U postgres ucpready -c "
SELECT
    name,
    search_vector
FROM products
WHERE merchant_id = (SELECT id FROM merchants WHERE domain = 'test.zologic.nl')
LIMIT 3;
"
```

## Verification

After indexing completes successfully, verify:

1. **Products exist**:
```bash
docker compose exec postgres psql -U postgres ucpready -c "
SELECT COUNT(*) as total_products
FROM products p
JOIN merchants m ON p.merchant_id = m.id
WHERE m.domain = 'test.zologic.nl';
"
```

2. **Variations are parsed correctly** (for products with variations):
```bash
docker compose exec postgres psql -U postgres ucpready -c "
SELECT
    name,
    has_variations,
    jsonb_pretty(variations) as variations
FROM products
WHERE has_variations = true
  AND merchant_id = (SELECT id FROM merchants WHERE domain = 'test.zologic.nl')
LIMIT 1;
"
```

3. **Search works**:
```bash
curl -X POST http://localhost/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}'
```

## Next Steps

Once products are indexed:
- Simple products should work immediately with embedded checkout
- Products with variations should show variation selectors in search results
- Clicking "Buy" should create checkout sessions with selected variation IDs
