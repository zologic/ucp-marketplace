-- Migration 005: Structured Category System
-- Creates proper category tables and migrates existing category text data

-- Create categories table for normalized category storage
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    google_taxonomy_id VARCHAR(50),
    google_taxonomy_path TEXT,
    description TEXT,
    image_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(tenant_id, slug);

COMMENT ON TABLE categories IS 'Normalized category taxonomy across all merchants';
COMMENT ON COLUMN categories.slug IS 'URL-safe identifier, unique per tenant';
COMMENT ON COLUMN categories.parent_id IS 'Parent category for hierarchical structure';
COMMENT ON COLUMN categories.google_taxonomy_id IS 'Google Product Taxonomy ID for SEO';

-- Create product_categories junction table
CREATE TABLE IF NOT EXISTS product_categories (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);

COMMENT ON TABLE product_categories IS 'Many-to-many relationship between products and categories';

-- Add variations columns to products table if they don't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_short TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_long TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variations BOOLEAN DEFAULT false;

-- Keep the old category column for backwards compatibility during transition
-- It will be used as fallback when structured categories aren't available

-- Create merchant_categories table to track categories imported from each merchant
CREATE TABLE IF NOT EXISTS merchant_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    external_id VARCHAR(255), -- Category ID from merchant's system
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    parent_external_id VARCHAR(255), -- Parent category ID from merchant's system
    google_taxonomy_id VARCHAR(50),
    description TEXT,
    product_count INTEGER DEFAULT 0,
    last_synced_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(merchant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_merchant_categories_merchant ON merchant_categories(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_categories_external ON merchant_categories(merchant_id, external_id);

COMMENT ON TABLE merchant_categories IS 'Categories as defined by each merchant, before normalization';
COMMENT ON COLUMN merchant_categories.external_id IS 'Category ID from merchant WooCommerce/UCP system';

-- Migrate existing product.category text data to structured format
-- This runs once during migration
DO $$
DECLARE
    tenant_record RECORD;
    product_record RECORD;
    category_id UUID;
    category_slug TEXT;
BEGIN
    -- For each tenant
    FOR tenant_record IN SELECT id FROM tenants LOOP
        -- Get distinct categories from products for this tenant
        FOR product_record IN
            SELECT DISTINCT
                TRIM(category) as category_name,
                TRIM(LOWER(REGEXP_REPLACE(category, '[^a-zA-Z0-9]+', '-', 'g'))) as category_slug
            FROM products
            WHERE tenant_id = tenant_record.id
              AND category IS NOT NULL
              AND TRIM(category) != ''
        LOOP
            -- Insert category if it doesn't exist
            INSERT INTO categories (tenant_id, name, slug)
            VALUES (tenant_record.id, product_record.category_name, product_record.category_slug)
            ON CONFLICT (tenant_id, slug) DO NOTHING;

            -- Get the category ID
            SELECT id INTO category_id
            FROM categories
            WHERE tenant_id = tenant_record.id
              AND slug = product_record.category_slug;

            -- Link all products with this category text to the category
            INSERT INTO product_categories (product_id, category_id)
            SELECT p.id, category_id
            FROM products p
            WHERE p.tenant_id = tenant_record.id
              AND TRIM(p.category) = product_record.category_name
            ON CONFLICT (product_id, category_id) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
