-- Create tenant_revenue table for revenue share configuration for white-label partners
CREATE TABLE IF NOT EXISTS tenant_revenue (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    revenue_share_percent INTEGER NOT NULL DEFAULT 0 CHECK (revenue_share_percent >= 0 AND revenue_share_percent <= 100),
    applies_to VARCHAR(20) NOT NULL DEFAULT 'both' CHECK (applies_to IN ('commission', 'cpc', 'both')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE tenant_revenue IS 'Revenue share configuration for white-label partners';
COMMENT ON COLUMN tenant_revenue.revenue_share_percent IS '0-100, percentage of revenue shared with partner';
