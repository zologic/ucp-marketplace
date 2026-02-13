# Fix: Products Not Showing in Search and Admin

## Problem
- Merchant shows 2 products after crawl/index
- Frontend search returns no results
- Backend Products and Categories pages show nothing

## Root Cause Analysis

The issue is likely one of these:

### 1. **Products missing search_vector** (Most Likely)
The frontend search uses full-text search with `search_vector @@ plainto_tsquery()`.
If `search_vector` column is NULL, products won't appear in search results.

### 2. **Tenant filtering issue**
Both admin Products page and frontend search filter by `tenant_id`.
If tenant_id doesn't match, products won't show.

### 3. **Products not properly indexed**
The `indexed_at` column tracks when products were last indexed for search.

## Diagnostic Steps

### Step 1: Run Diagnostic Script
```bash
cd /workspace/cmlkoklmf0001impj6c6thsc5/ucp-marketplace
./diagnose-products.sh
```

This will show:
- Total products in database
- How many have search_vector populated
- How many are indexed
- Sample products with their data
- Categories count
- Merchants status

### Step 2: Check Specific Issues

#### Check if products exist:
```bash
docker compose exec postgres psql -U postgres -d marketplace -c "
SELECT COUNT(*) FROM products;
"
```

#### Check if search_vector is NULL:
```bash
docker compose exec postgres psql -U postgres -d marketplace -c "
SELECT id, name,
       CASE WHEN search_vector IS NULL THEN 'NULL' ELSE 'POPULATED' END as sv_status
FROM products;
"
```

#### Check tenant_id matching:
```bash
docker compose exec postgres psql -U postgres -d marketplace -c "
SELECT
    t.id as tenant_id, t.domain as tenant_domain,
    m.id as merchant_id, m.domain as merchant_domain,
    COUNT(p.id) as product_count
FROM tenants t
LEFT JOIN merchants m ON t.id = m.tenant_id
LEFT JOIN products p ON m.id = p.merchant_id
GROUP BY t.id, m.id;
"
```

## Solutions

### Solution 1: Fix search_vector for existing products

If products exist but search_vector is NULL, it means the GENERATED ALWAYS column isn't working or needs to be regenerated.

```bash
docker compose exec postgres psql -U postgres -d marketplace << 'EOF'
-- Check if search_vector column exists and is generated
SELECT column_name, data_type, is_generated
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'search_vector';

-- If it's not a generated column, drop and recreate it
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;

ALTER TABLE products
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(brand, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(description_short, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(description_long, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'C')
    ) STORED;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_products_search_vector
ON products USING GIN (search_vector);

-- Verify it worked
SELECT id, name,
       CASE WHEN search_vector IS NULL THEN 'NULL' ELSE 'POPULATED' END as sv_status
FROM products
LIMIT 5;
EOF
```

### Solution 2: Verify tenant configuration

Make sure the tenant domain matches your actual domain:

```bash
docker compose exec postgres psql -U postgres -d marketplace -c "
SELECT id, name, domain, status FROM tenants;
"
```

If the domain doesn't match, update it:
```bash
docker compose exec postgres psql -U postgres -d marketplace -c "
UPDATE tenants SET domain = 'YOUR_ACTUAL_DOMAIN' WHERE domain = 'localhost';
"
```

### Solution 3: Re-index products

If products exist but aren't appearing, trigger a re-index:

1. In admin UI, go to Merchants page
2. Find your merchant
3. Click "Re-crawl" button
4. Then click "Index Products" button

Or via API:
```bash
# Get merchant ID
MERCHANT_ID=$(docker compose exec -T postgres psql -U postgres -d marketplace -t -c "
SELECT id FROM merchants LIMIT 1;" | tr -d ' ')

# Trigger re-index
curl -X POST https://YOUR_DOMAIN/admin/merchants/${MERCHANT_ID}/index \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Solution 4: Check categories

Categories might not be created during crawl. Check and create manually if needed:

```bash
docker compose exec postgres psql -U postgres -d marketplace << 'EOF'
-- Check categories
SELECT COUNT(*) FROM categories;

-- Check product_categories junction table
SELECT COUNT(*) FROM product_categories;

-- If no categories, you may need to create them
-- Example:
INSERT INTO categories (tenant_id, name, slug, is_active)
SELECT DISTINCT
    p.tenant_id,
    p.category as name,
    LOWER(REPLACE(p.category, ' ', '-')) as slug,
    true as is_active
FROM products p
WHERE p.category IS NOT NULL
  AND p.category != ''
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Link products to categories
INSERT INTO product_categories (product_id, category_id)
SELECT DISTINCT
    p.id,
    c.id
FROM products p
JOIN categories c ON c.slug = LOWER(REPLACE(p.category, ' ', '-'))
WHERE p.category IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_categories pc
    WHERE pc.product_id = p.id AND pc.category_id = c.id
  );
EOF
```

## Testing After Fix

### Test 1: Backend Admin Products Page
1. Login to admin at https://YOUR_DOMAIN/admin-ui/
2. Go to Products page
3. Select your tenant from dropdown
4. Should see products listed

### Test 2: Backend Categories Page
1. Go to Categories page in admin
2. Should see categories with product counts

### Test 3: Frontend Search
1. Go to https://YOUR_DOMAIN/
2. Search for a product name
3. Should see results

### Test 4: API Test
```bash
# Test admin products endpoint
curl https://YOUR_DOMAIN/admin/products?tenant_id=TENANT_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Test public search endpoint
curl -X POST https://YOUR_DOMAIN/api/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Domain: YOUR_DOMAIN" \
  -d '{"query": "test"}'
```

## Prevention

To prevent this issue in the future:

1. **Always verify after crawl**: Check that search_vector is populated
2. **Use the Index button**: After crawl, always click "Index Products"
3. **Monitor logs**: Check API logs for any errors during crawl/index

## Still Not Working?

If products still don't show after these fixes, check:

1. **Database logs**:
```bash
docker compose logs postgres | tail -50
```

2. **API logs**:
```bash
docker compose logs api | tail -50
```

3. **Check for errors during crawl**:
Look for any error messages when you clicked "Re-crawl"

4. **Verify UCP endpoint**:
```bash
docker compose exec postgres psql -U postgres -d marketplace -c "
SELECT domain, ucp_endpoint, status FROM merchants;
"
```

The UCP endpoint should return valid product data.
