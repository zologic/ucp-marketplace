-- Create merchants table for UCP-compliant WooCommerce stores
CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    ucp_endpoint TEXT,
    public_key TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'active', 'suspended')),
    last_verified_at TIMESTAMP,
    admin_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_merchants_tenant_domain ON merchants(tenant_id, domain);
CREATE INDEX idx_merchants_status ON merchants(status);
CREATE INDEX idx_merchants_tenant_status ON merchants(tenant_id, status);

-- Comments
COMMENT ON TABLE merchants IS 'UCP-compliant WooCommerce stores';
COMMENT ON COLUMN merchants.status IS 'pending=added, verified=UCP valid, active=searchable, suspended=disabled';
COMMENT ON COLUMN merchants.admin_override IS 'Bypass payment checks when TRUE';
