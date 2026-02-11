-- ============================================================================
-- Migration 002: Add Product Variations and Description Fields
-- ============================================================================
-- Purpose: Add support for product variations (size, color, etc.) and
--          separate description fields (short/long) to products table
-- Created: 2026-02-11
-- ============================================================================

-- Add new columns to products table
ALTER TABLE products
    ADD COLUMN description_short TEXT,
    ADD COLUMN description_long TEXT,
    ADD COLUMN variations JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN has_variations BOOLEAN DEFAULT false;

-- Migrate existing description data to description_long
UPDATE products
SET description_long = description
WHERE description IS NOT NULL;

-- Add comment for new columns
COMMENT ON COLUMN products.description_short IS 'Brief description for product cards (max 150 chars recommended)';
COMMENT ON COLUMN products.description_long IS 'Full product description for detail pages';
COMMENT ON COLUMN products.variations IS 'JSONB array of product variations (size, color, etc.) with structure: [{"attribute": "Size", "options": [{"value": "40", "available": true, "price_modifier_cents": 0}]}]';
COMMENT ON COLUMN products.has_variations IS 'Quick check flag: true if variations array has items';

-- Add index for products with variations (partial index for better performance)
CREATE INDEX idx_products_has_variations ON products(has_variations) WHERE has_variations = true;

-- Add GIN index for JSONB variation searches
CREATE INDEX idx_products_variations_gin ON products USING gin(variations);

-- Update full-text search index to include new description fields
DROP INDEX IF EXISTS idx_products_search;
CREATE INDEX idx_products_search ON products USING GIN (
    to_tsvector('english',
        COALESCE(name, '') || ' ' ||
        COALESCE(description, '') || ' ' ||
        COALESCE(description_short, '') || ' ' ||
        COALESCE(description_long, '') || ' ' ||
        COALESCE(category, '') || ' ' ||
        COALESCE(brand, '')
    )
);

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- New Columns: description_short, description_long, variations, has_variations
-- New Indexes: idx_products_has_variations, idx_products_variations_gin, updated idx_products_search
-- ============================================================================
