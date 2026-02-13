#!/bin/bash

echo "=== Checking Products in Database ==="
docker compose exec -T postgres psql -U postgres -d marketplace -c "
SELECT
    COUNT(*) as total_products,
    COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END) as with_search_vector,
    COUNT(CASE WHEN indexed_at IS NOT NULL THEN 1 END) as indexed
FROM products;
"

echo ""
echo "=== Sample Products ==="
docker compose exec -T postgres psql -U postgres -d marketplace -c "
SELECT
    id,
    name,
    merchant_id,
    tenant_id,
    CASE WHEN search_vector IS NULL THEN 'NULL' ELSE 'SET' END as search_vector_status,
    indexed_at
FROM products
LIMIT 5;
"

echo ""
echo "=== Checking Categories ==="
docker compose exec -T postgres psql -U postgres -d marketplace -c "
SELECT COUNT(*) as total_categories FROM categories;
"

echo ""
echo "=== Sample Categories ==="
docker compose exec -T postgres psql -U postgres -d marketplace -c "
SELECT id, name, tenant_id, is_active FROM categories LIMIT 5;
"

echo ""
echo "=== Checking Merchants ==="
docker compose exec -T postgres psql -U postgres -d marketplace -c "
SELECT id, domain, status, products_count FROM merchants;
"

echo ""
echo "=== Checking Search Vector Column ==="
docker compose exec -T postgres psql -U postgres -d marketplace -c "
SELECT column_name, data_type, is_generated, generation_expression
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'search_vector';
"
