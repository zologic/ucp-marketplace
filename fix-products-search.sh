#!/bin/bash

echo "========================================"
echo "Fix Products & Search Issue"
echo "========================================"
echo ""

echo "Step 1: Checking current state..."
docker compose exec -T postgres psql -U postgres -d marketplace << 'EOF'
\echo '=== Product Count ==='
SELECT COUNT(*) as total_products FROM products;

\echo ''
\echo '=== Search Vector Status ==='
SELECT column_name, is_generated
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'search_vector';

\echo ''
\echo '=== Products with NULL search_vector ==='
SELECT
    COUNT(CASE WHEN search_vector IS NULL THEN 1 END) as null_count,
    COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END) as populated_count
FROM products;

\echo ''
\echo '=== Category Status ==='
SELECT COUNT(*) as total_categories FROM categories;

\echo ''
\echo '=== Tenant Info ==='
SELECT id, name, domain FROM tenants;
EOF

echo ""
echo "========================================"
echo "Step 2: Applying fixes..."
echo "========================================"
echo ""

docker compose exec -T postgres psql -U postgres -d marketplace << 'EOF'
-- Fix 1: Regenerate search_vector column
\echo 'Dropping old search_vector column...'
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;

\echo 'Creating new GENERATED search_vector column...'
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

\echo 'Creating GIN index on search_vector...'
DROP INDEX IF EXISTS idx_products_search_vector;
CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);

-- Fix 2: Create categories from products
\echo ''
\echo 'Creating categories from product data...'
INSERT INTO categories (tenant_id, name, slug, is_active, display_order)
SELECT DISTINCT
    p.tenant_id,
    p.category as name,
    LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi')) as slug,
    true as is_active,
    0 as display_order
FROM products p
WHERE p.category IS NOT NULL
  AND p.category != ''
  AND p.category != 'null'
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Fix 3: Link products to categories
\echo 'Linking products to categories...'
INSERT INTO product_categories (product_id, category_id)
SELECT DISTINCT
    p.id as product_id,
    c.id as category_id
FROM products p
JOIN categories c ON
    c.tenant_id = p.tenant_id
    AND c.slug = LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi'))
WHERE p.category IS NOT NULL
  AND p.category != ''
  AND p.category != 'null'
  AND NOT EXISTS (
    SELECT 1 FROM product_categories pc
    WHERE pc.product_id = p.id AND pc.category_id = c.id
  );

-- Fix 4: Ensure tenant_id is correct on products
\echo ''
\echo 'Verifying tenant_id consistency...'
UPDATE products p
SET tenant_id = m.tenant_id
FROM merchants m
WHERE p.merchant_id = m.id
  AND p.tenant_id != m.tenant_id;
EOF

echo ""
echo "========================================"
echo "Step 3: Verifying fixes..."
echo "========================================"
echo ""

docker compose exec -T postgres psql -U postgres -d marketplace << 'EOF'
\echo '=== Search Vector Status (After Fix) ==='
SELECT
    COUNT(CASE WHEN search_vector IS NULL THEN 1 END) as null_count,
    COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END) as populated_count,
    COUNT(*) as total
FROM products;

\echo ''
\echo '=== Sample Products with Search Vector ==='
SELECT
    id,
    name,
    category,
    CASE WHEN search_vector IS NULL THEN 'NULL' ELSE 'POPULATED' END as sv_status
FROM products
LIMIT 5;

\echo ''
\echo '=== Categories Created ==='
SELECT
    c.id,
    c.name,
    c.slug,
    COUNT(pc.product_id) as product_count
FROM categories c
LEFT JOIN product_categories pc ON c.id = pc.category_id
GROUP BY c.id, c.name, c.slug
ORDER BY product_count DESC
LIMIT 10;

\echo ''
\echo '=== Product-Category Links ==='
SELECT COUNT(*) as total_links FROM product_categories;

\echo ''
\echo '=== Tenant Product Summary ==='
SELECT
    t.id,
    t.name as tenant_name,
    t.domain,
    COUNT(DISTINCT m.id) as merchants,
    COUNT(DISTINCT p.id) as products
FROM tenants t
LEFT JOIN merchants m ON t.id = m.tenant_id
LEFT JOIN products p ON m.id = p.merchant_id
GROUP BY t.id, t.name, t.domain
ORDER BY t.id;
EOF

echo ""
echo "========================================"
echo "Fix Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Login to admin UI and check Products page"
echo "2. Check Categories page"
echo "3. Test frontend search with a product name"
echo ""
echo "If search still doesn't work, check:"
echo "- PostgreSQL version (needs 12+): docker compose exec postgres psql --version"
echo "- API logs: docker compose logs api | tail -50"
echo "- Frontend console for errors"
echo ""
