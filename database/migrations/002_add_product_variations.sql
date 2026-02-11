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

-- ============================================================================
-- PERFORMANCE OPTIMIZATION: Generated Column with Weighted Search
-- ============================================================================
-- Using a GENERATED column with weighted tsvector for sub-100ms search performance
-- Weights: A (highest) = name, brand; B = category; C = descriptions
-- This eliminates recalculation overhead on every search query

-- Add generated search vector column with weighted ranking
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

-- Create GIN index on the generated column (much faster than function-based index)
DROP INDEX IF EXISTS idx_products_search;
CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);

-- Add comment explaining the weighted search
COMMENT ON COLUMN products.search_vector IS 'Generated tsvector for weighted full-text search. Weights: A=name/brand (highest), B=category, C=descriptions. Updated automatically on row changes.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- New Columns: description_short, description_long, variations, has_variations
-- New Indexes: idx_products_has_variations, idx_products_variations_gin, updated idx_products_search
-- ============================================================================
