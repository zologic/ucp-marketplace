-- Migration 007: Ensure search_vector works on all PostgreSQL versions
--
-- This migration ensures the search_vector column works properly
-- even if the GENERATED ALWAYS column failed to create correctly.
--
-- Strategy:
-- 1. Drop existing search_vector if it's not working
-- 2. Add as GENERATED ALWAYS column (PostgreSQL 12+)
-- 3. Add trigger-based fallback for PostgreSQL 11 or if GENERATED fails
-- 4. Ensure GIN index exists

-- Drop existing search_vector and index if they exist
DROP INDEX IF EXISTS idx_products_search_vector;
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;

-- Try to add GENERATED ALWAYS column (PostgreSQL 12+)
DO $$
BEGIN
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

    RAISE NOTICE 'search_vector created as GENERATED ALWAYS column';
EXCEPTION
    WHEN feature_not_supported THEN
        -- PostgreSQL < 12 doesn't support GENERATED columns
        -- Fall back to regular column with trigger
        RAISE NOTICE 'GENERATED ALWAYS not supported, using trigger-based approach';

        -- Add regular column
        ALTER TABLE products ADD COLUMN search_vector tsvector;

        -- Create function to update search_vector
        CREATE OR REPLACE FUNCTION products_search_vector_update()
        RETURNS TRIGGER AS $trigger$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'B') ||
                setweight(to_tsvector('english', COALESCE(NEW.description_short, '')), 'C') ||
                setweight(to_tsvector('english', COALESCE(NEW.description_long, '')), 'C') ||
                setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
            RETURN NEW;
        END;
        $trigger$ LANGUAGE plpgsql;

        -- Create trigger
        DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;
        CREATE TRIGGER products_search_vector_trigger
            BEFORE INSERT OR UPDATE ON products
            FOR EACH ROW
            EXECUTE FUNCTION products_search_vector_update();

        -- Populate existing rows
        UPDATE products
        SET search_vector =
            setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(brand, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
            setweight(to_tsvector('english', COALESCE(description_short, '')), 'C') ||
            setweight(to_tsvector('english', COALESCE(description_long, '')), 'C') ||
            setweight(to_tsvector('english', COALESCE(description, '')), 'C')
        WHERE search_vector IS NULL;
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create search_vector column: %', SQLERRM;
END
$$;

-- Create GIN index on search_vector
CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);

-- Verify it worked
DO $$
DECLARE
    null_count INTEGER;
    total_count INTEGER;
BEGIN
    SELECT
        COUNT(CASE WHEN search_vector IS NULL THEN 1 END),
        COUNT(*)
    INTO null_count, total_count
    FROM products;

    RAISE NOTICE 'Products: % total, % with NULL search_vector', total_count, null_count;

    IF total_count > 0 AND null_count > 0 THEN
        RAISE WARNING 'Some products have NULL search_vector. This may indicate an issue.';
    END IF;
END
$$;

COMMENT ON COLUMN products.search_vector IS 'Full-text search vector. Automatically updated on INSERT/UPDATE. Weighted: A=name/brand (highest), B=category, C=descriptions.';
