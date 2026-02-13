-- Migration 008: Brands table for better brand management and filtering
--
-- Creates a normalized brands table to store unique brands across all merchants
-- Similar to categories, but for product brands

CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    logo_url TEXT,
    website_url TEXT,
    product_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_brands_tenant ON brands(tenant_id);
CREATE INDEX idx_brands_slug ON brands(tenant_id, slug);
CREATE INDEX idx_brands_active ON brands(tenant_id, is_active);

COMMENT ON TABLE brands IS 'Normalized brand taxonomy across all merchants';
COMMENT ON COLUMN brands.slug IS 'URL-safe identifier, unique per tenant';
COMMENT ON COLUMN brands.product_count IS 'Cached count of products with this brand';

-- Add product_brands junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS product_brands (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (product_id, brand_id)
);

CREATE INDEX idx_product_brands_product ON product_brands(product_id);
CREATE INDEX idx_product_brands_brand ON product_brands(brand_id);

COMMENT ON TABLE product_brands IS 'Many-to-many relationship between products and brands';

-- Populate brands from existing product data
INSERT INTO brands (tenant_id, name, slug, product_count)
SELECT DISTINCT
    p.tenant_id,
    p.brand as name,
    LOWER(REGEXP_REPLACE(p.brand, '[^a-z0-9]+', '-', 'gi')) as slug,
    COUNT(*) as product_count
FROM products p
WHERE p.brand IS NOT NULL
  AND p.brand != ''
  AND p.brand != 'null'
GROUP BY p.tenant_id, p.brand
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Link existing products to brands
INSERT INTO product_brands (product_id, brand_id)
SELECT DISTINCT
    p.id as product_id,
    b.id as brand_id
FROM products p
JOIN brands b ON
    b.tenant_id = p.tenant_id
    AND b.slug = LOWER(REGEXP_REPLACE(p.brand, '[^a-z0-9]+', '-', 'gi'))
WHERE p.brand IS NOT NULL
  AND p.brand != ''
  AND p.brand != 'null'
ON CONFLICT (product_id, brand_id) DO NOTHING;

-- Update product counts
UPDATE brands b
SET product_count = (
    SELECT COUNT(*)
    FROM product_brands pb
    WHERE pb.brand_id = b.id
);
