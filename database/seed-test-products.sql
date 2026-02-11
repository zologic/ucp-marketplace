-- ============================================================================
-- Seed Test Products with Variations
-- Purpose: Add sample products with variations for testing marketplace features
-- Usage: Run this ONCE to populate test data
-- ============================================================================

-- Insert test products with variations
INSERT INTO products (
    id,
    merchant_id,
    tenant_id,
    external_id,
    name,
    description,
    description_short,
    description_long,
    variations,
    has_variations,
    price_cents,
    currency,
    category,
    brand,
    image_url,
    stock_status,
    signing_status,
    indexed_at
)
SELECT
    gen_random_uuid(),
    m.id,
    m.tenant_id,
    'test-shoe-001',
    'Premium Running Shoes',
    'High-performance running shoes with advanced cushioning technology.',
    'High-performance running shoes with advanced cushioning.',
    'Premium running shoes designed for athletes and fitness enthusiasts. Features advanced cushioning technology, breathable mesh upper, and durable rubber outsole. Perfect for long-distance running and daily training.',
    '[
        {
            "attribute": "Size",
            "options": [
                {"value": "US 8", "available": true, "price_modifier_cents": 0},
                {"value": "US 9", "available": true, "price_modifier_cents": 0},
                {"value": "US 10", "available": true, "price_modifier_cents": 0},
                {"value": "US 11", "available": true, "price_modifier_cents": 0},
                {"value": "US 12", "available": false, "price_modifier_cents": 0}
            ]
        },
        {
            "attribute": "Color",
            "options": [
                {"value": "Black", "available": true, "price_modifier_cents": 0},
                {"value": "White", "available": true, "price_modifier_cents": 0},
                {"value": "Blue", "available": true, "price_modifier_cents": 500},
                {"value": "Red", "available": true, "price_modifier_cents": 500}
            ]
        }
    ]'::jsonb,
    true,
    12999, -- $129.99
    'EUR',
    'Footwear',
    'Nike',
    'https://test.zologic.nl/wp-content/uploads/woocommerce-placeholder.webp',
    'in_stock',
    'pending',
    NOW()
FROM merchants m
WHERE m.domain = 'test.zologic.nl'
ON CONFLICT (merchant_id, external_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    description_short = EXCLUDED.description_short,
    description_long = EXCLUDED.description_long,
    variations = EXCLUDED.variations,
    has_variations = EXCLUDED.has_variations,
    price_cents = EXCLUDED.price_cents,
    category = EXCLUDED.category,
    brand = EXCLUDED.brand,
    indexed_at = NOW();

-- Insert another test product with variations
INSERT INTO products (
    id,
    merchant_id,
    tenant_id,
    external_id,
    name,
    description,
    description_short,
    description_long,
    variations,
    has_variations,
    price_cents,
    currency,
    category,
    brand,
    image_url,
    stock_status,
    signing_status,
    indexed_at
)
SELECT
    gen_random_uuid(),
    m.id,
    m.tenant_id,
    'test-tshirt-001',
    'Classic Cotton T-Shirt',
    'Comfortable 100% cotton t-shirt in multiple sizes and colors.',
    'Comfortable 100% cotton t-shirt available in various sizes.',
    'Premium quality cotton t-shirt made from 100% organic cotton. Features a classic fit, ribbed crew neck, and reinforced seams. Perfect for everyday wear or layering.',
    '[
        {
            "attribute": "Size",
            "options": [
                {"value": "S", "available": true, "price_modifier_cents": 0},
                {"value": "M", "available": true, "price_modifier_cents": 0},
                {"value": "L", "available": true, "price_modifier_cents": 200},
                {"value": "XL", "available": true, "price_modifier_cents": 200},
                {"value": "XXL", "available": true, "price_modifier_cents": 400}
            ]
        },
        {
            "attribute": "Color",
            "options": [
                {"value": "Black", "available": true, "price_modifier_cents": 0},
                {"value": "White", "available": true, "price_modifier_cents": 0},
                {"value": "Navy", "available": true, "price_modifier_cents": 0},
                {"value": "Gray", "available": false, "price_modifier_cents": 0}
            ]
        }
    ]'::jsonb,
    true,
    2999, -- $29.99
    'EUR',
    'Apparel',
    'Adidas',
    'https://test.zologic.nl/wp-content/uploads/woocommerce-placeholder.webp',
    'in_stock',
    'pending',
    NOW()
FROM merchants m
WHERE m.domain = 'test.zologic.nl'
ON CONFLICT (merchant_id, external_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    description_short = EXCLUDED.description_short,
    description_long = EXCLUDED.description_long,
    variations = EXCLUDED.variations,
    has_variations = EXCLUDED.has_variations,
    price_cents = EXCLUDED.price_cents,
    category = EXCLUDED.category,
    brand = EXCLUDED.brand,
    indexed_at = NOW();

-- Summary
SELECT
    COUNT(*) as total_products,
    COUNT(*) FILTER (WHERE has_variations = true) as products_with_variations
FROM products
WHERE merchant_id IN (SELECT id FROM merchants WHERE domain = 'test.zologic.nl');
