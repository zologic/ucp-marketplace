# Product Crawling, Indexing, and Search Flow Analysis

## Complete Product Flow

### 1. Product Crawling (Re-crawl Button)
**Endpoint:** `POST /admin/merchants/:id/recrawl`
**Location:** `api/routes/admin.js:327-554`

**What happens:**
1. Fetches merchant's `service_base_url` from database
2. Constructs products URL: `${service_base_url}/products`
3. Fetches products array from merchant's UCP endpoint
4. For each product:
   - Checks if product exists using `merchant_id + external_id`
   - **INSERT** if new, **UPDATE** if exists
   - Sets `indexed_at = NOW()`
   - Stores data in `products` table:
     - `merchant_id`, `tenant_id`, `external_id`
     - `name`, `description`, `price_cents`, `currency`
     - `category`, `brand`, `image_url`, `stock_status`
     - `has_variations`, `variations`
5. Updates `merchants.last_indexed_at = NOW()`

**Key Point:** Re-crawl inserts products into the database directly. The `search_vector` column should be automatically populated because it's a **GENERATED ALWAYS** column.

### 2. Product Indexing (Index Button)
**Endpoint:** `POST /admin/merchants/:id/index`
**Location:** `api/routes/admin.js:557-595`
**Job:** `api/jobs/indexProducts.js`

**What happens:**
1. Sets `merchants.last_indexed_at = NULL` to trigger immediate re-index
2. Calls `indexProducts(db)` job which:
   - Finds merchants due for indexing (where `last_indexed_at IS NULL`)
   - Fetches products from UCP endpoint
   - **UPSERTS** products with `ON CONFLICT (merchant_id, external_id) DO UPDATE`
   - Sets `indexed_at = NOW()`
   - Updates `merchants.last_indexed_at = NOW()`

**Key Point:** Index does the same thing as Re-crawl - it inserts/updates products in the database. Same flow, same result.

### 3. Search Vector Generation
**Location:** `database/migrations/000_base_schema.sql:652-660`

```sql
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(brand, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(description_short, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(description_long, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'C')
    ) STORED;
```

**How it works:**
- `GENERATED ALWAYS ... STORED` means PostgreSQL automatically computes and stores this column
- **Triggers automatically** on INSERT or UPDATE
- No manual update needed
- Creates full-text search tokens with weights (A=highest, C=lowest)

### 4. Frontend Search
**Endpoint:** `POST /api/search`
**Location:** `api/routes/public.js:79-198`

**SQL Query:**
```sql
SELECT ...
FROM products p
JOIN merchants m ON p.merchant_id = m.id
WHERE p.tenant_id = $1
  AND p.merchant_id = ANY($2::uuid[])
  AND p.search_vector @@ plainto_tsquery('english', $3)
```

**The Problem:** If `search_vector` is NULL, the query returns nothing.

### 5. Admin Products Page
**Component:** `admin/src/pages/Products.jsx`
**API Endpoint:** `GET /admin/products`
**Location:** `api/routes/admin.js:1669-1780`

**SQL Query:**
```sql
SELECT
    p.id, p.name, p.description, ...
FROM products p
JOIN merchants m ON p.merchant_id = m.id
JOIN tenants t ON p.tenant_id = t.id
WHERE p.tenant_id = $1  -- Required filter
```

**The Problem:** If no `tenant_id` is selected or doesn't match, products won't show.

### 6. Admin Categories Page
**Component:** `admin/src/pages/Categories.jsx`
**API Endpoint:** `GET /admin/categories`
**Location:** `api/routes/admin.js:1474-1510`

**SQL Query:**
```sql
SELECT c.*, COUNT(DISTINCT pc.product_id) as product_count
FROM categories c
LEFT JOIN product_categories pc ON c.id = pc.category_id
WHERE c.tenant_id = $1
```

**The Problem:** Categories are NOT automatically created during crawl/index. They must be created manually or via a separate process.

## Root Cause Analysis

### Why Products Show Count But Don't Appear

When you see "2 products" after crawl/index, this count comes from:
```sql
SELECT COUNT(*) FROM products WHERE merchant_id = :id
```

This proves products ARE in the database. But they don't show because:

### Issue #1: search_vector Column Not Generated (Most Likely)

**Symptom:** Frontend search returns nothing, even though products exist.

**Possible Causes:**

1. **PostgreSQL version too old**
   - `GENERATED ALWAYS ... STORED` requires PostgreSQL 12+
   - If running PostgreSQL 11 or older, the column won't be generated
   - Column will exist but always be NULL

2. **Migration ran before column addition**
   - If products were inserted before the ALTER TABLE added search_vector
   - And if GENERATED column wasn't retroactive

3. **Column definition incorrect**
   - Syntax error in GENERATED expression
   - Column exists but isn't actually GENERATED

**How to Check:**
```sql
-- Check if column is actually generated
SELECT column_name, data_type, is_generated, generation_expression
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'search_vector';
```

**Expected:** `is_generated = 'ALWAYS'`

**If not generated, you'll see:** `is_generated = 'NEVER'` or NULL

### Issue #2: Categories Not Created

**Symptom:** Admin Categories page shows 0 categories.

**Cause:** The crawl/index process does NOT create categories. It only:
- Stores the `category` string in the `products.category` column
- Does NOT create entries in the `categories` table
- Does NOT populate the `product_categories` junction table

**The Code Evidence:**

In `indexProducts.js` line 162:
```javascript
category: product.category || null,  // Just stores the string
```

No code creates category records or links products to categories.

**Impact:**
- Categories page shows empty
- Category filtering doesn't work
- Search with category filters doesn't work
- Product counts by category don't work

### Issue #3: Tenant ID Mismatch

**Symptom:** Products exist but don't show in admin.

**Cause:** The Products admin page REQUIRES selecting a tenant:
```javascript
// admin/src/pages/Products.jsx:79
const params = {
    tenant_id: selectedTenant,  // Required
    page: pagination.page,
    limit: pagination.limit
};
```

If the tenant_id doesn't match, products won't show.

## The Fix

Based on this analysis, here's what needs to happen:

### Fix 1: Verify and Regenerate search_vector

```sql
-- 1. Check if search_vector is generated
SELECT
    column_name,
    data_type,
    is_generated,
    generation_expression
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'search_vector';

-- 2. If is_generated = 'NEVER' or NULL, recreate it
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

-- 3. Recreate index
DROP INDEX IF EXISTS idx_products_search_vector;
CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);

-- 4. Verify it worked
SELECT
    id,
    name,
    CASE WHEN search_vector IS NULL THEN 'NULL' ELSE 'POPULATED' END as status
FROM products
LIMIT 10;
```

### Fix 2: Create Categories from Existing Products

```sql
-- 1. Create categories from product.category strings
INSERT INTO categories (tenant_id, name, slug, is_active)
SELECT DISTINCT
    p.tenant_id,
    p.category as name,
    LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi')) as slug,
    true as is_active
FROM products p
WHERE p.category IS NOT NULL
  AND p.category != ''
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- 2. Link products to categories via product_categories junction table
INSERT INTO product_categories (product_id, category_id)
SELECT DISTINCT
    p.id as product_id,
    c.id as category_id
FROM products p
JOIN categories c ON
    c.tenant_id = p.tenant_id
    AND c.slug = LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi'))
WHERE p.category IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_categories pc
    WHERE pc.product_id = p.id AND pc.category_id = c.id
  );

-- 3. Verify
SELECT
    c.name,
    c.slug,
    COUNT(pc.product_id) as product_count
FROM categories c
LEFT JOIN product_categories pc ON c.id = pc.category_id
GROUP BY c.id, c.name, c.slug
ORDER BY product_count DESC;
```

### Fix 3: Verify Tenant Configuration

```sql
-- Check tenant_id on products matches tenants table
SELECT
    t.id as tenant_id,
    t.name as tenant_name,
    t.domain,
    COUNT(DISTINCT m.id) as merchant_count,
    COUNT(p.id) as product_count
FROM tenants t
LEFT JOIN merchants m ON t.id = m.tenant_id
LEFT JOIN products p ON m.id = p.merchant_id
GROUP BY t.id
ORDER BY t.id;
```

If tenant_id is wrong, update it:
```sql
UPDATE products
SET tenant_id = (SELECT tenant_id FROM merchants WHERE id = products.merchant_id)
WHERE tenant_id != (SELECT tenant_id FROM merchants WHERE id = products.merchant_id);
```

## Quick Fix Script

```bash
cd /workspace/cmlkoklmf0001impj6c6thsc5/ucp-marketplace

docker compose exec postgres psql -U postgres -d marketplace << 'EOF'
-- Fix 1: Regenerate search_vector
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
CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);

-- Fix 2: Create categories
INSERT INTO categories (tenant_id, name, slug, is_active)
SELECT DISTINCT
    p.tenant_id,
    p.category,
    LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi')),
    true
FROM products p
WHERE p.category IS NOT NULL AND p.category != ''
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO product_categories (product_id, category_id)
SELECT DISTINCT p.id, c.id
FROM products p
JOIN categories c ON c.tenant_id = p.tenant_id
    AND c.slug = LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi'))
WHERE p.category IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_categories pc
    WHERE pc.product_id = p.id AND pc.category_id = c.id
  );

-- Verify
SELECT 'Products with search_vector:' as status, COUNT(*) FROM products WHERE search_vector IS NOT NULL;
SELECT 'Categories created:' as status, COUNT(*) FROM categories;
SELECT 'Product-category links:' as status, COUNT(*) FROM product_categories;
EOF
```

## Why This Happens

The system was designed with these assumptions:
1. **search_vector auto-generates** - PostgreSQL 12+ required
2. **Categories are created separately** - Not during crawl/index
3. **Tenant ID is always correct** - Set during product insert

If any assumption fails, products won't be searchable even though they're in the database.

## Prevention

To prevent this in the future:

1. **Check PostgreSQL version** - Ensure 12+ for GENERATED columns
2. **Create categories after crawl** - Run the category creation SQL after each crawl
3. **Verify search_vector** - Always check it's populated after index
4. **Add automated category creation** - Modify indexProducts.js to create categories automatically

## Recommended: Add Automatic Category Creation

The best long-term fix is to modify `indexProducts.js` to create categories automatically:

```javascript
// After line 195 in indexProducts.js, add:

// Create categories from products
await db.query(`
    INSERT INTO categories (tenant_id, name, slug, is_active)
    SELECT DISTINCT
        p.tenant_id,
        p.category,
        LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi')),
        true
    FROM products p
    WHERE p.merchant_id = $1
      AND p.category IS NOT NULL
      AND p.category != ''
    ON CONFLICT (tenant_id, slug) DO NOTHING
`, [merchant.id]);

// Link products to categories
await db.query(`
    INSERT INTO product_categories (product_id, category_id)
    SELECT DISTINCT p.id, c.id
    FROM products p
    JOIN categories c ON c.tenant_id = p.tenant_id
        AND c.slug = LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi'))
    WHERE p.merchant_id = $1
      AND p.category IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM product_categories pc
        WHERE pc.product_id = p.id AND pc.category_id = c.id
      )
`, [merchant.id]);
```

This would make categories "just work" without manual intervention.
