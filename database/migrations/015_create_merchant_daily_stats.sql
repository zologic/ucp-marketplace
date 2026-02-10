-- Create merchant_daily_stats table for pre-aggregated daily analytics
CREATE TABLE IF NOT EXISTS merchant_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    search_count INTEGER NOT NULL DEFAULT 0 CHECK (search_count >= 0),
    click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
    checkout_count INTEGER NOT NULL DEFAULT 0 CHECK (checkout_count >= 0),
    order_count INTEGER NOT NULL DEFAULT 0 CHECK (order_count >= 0),
    revenue_cents INTEGER NOT NULL DEFAULT 0 CHECK (revenue_cents >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_merchant_daily_stats_merchant_date ON merchant_daily_stats(merchant_id, date);
CREATE INDEX idx_merchant_daily_stats_tenant_date ON merchant_daily_stats(tenant_id, date);

-- Comments
COMMENT ON TABLE merchant_daily_stats IS 'Pre-aggregated daily analytics per merchant for fast dashboard queries';
