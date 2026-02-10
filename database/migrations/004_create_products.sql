-- Create products table for indexed product catalog
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL,
    category TEXT,
    brand TEXT,
    image_url TEXT,
    stock_status VARCHAR(20) DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock', 'out_of_stock', 'backorder')),
    indexed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_products_merchant_external ON products(merchant_id, external_id);
CREATE INDEX idx_products_tenant_merchant ON products(tenant_id, merchant_id);
CREATE INDEX idx_products_stock ON products(stock_status);

-- Full-text search index
CREATE INDEX idx_products_search ON products USING GIN (
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(brand, ''))
);

-- Comments
COMMENT ON TABLE products IS 'Indexed product catalog from all merchants';
COMMENT ON COLUMN products.external_id IS 'Merchant product ID';
COMMENT ON COLUMN products.price_cents IS 'Price in minor units (cents)';
