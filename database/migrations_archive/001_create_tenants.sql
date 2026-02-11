-- Create tenants table for white-label deployment configurations
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    branding JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_status ON tenants(status);

-- Comments
COMMENT ON TABLE tenants IS 'White-label deployment configurations';
COMMENT ON COLUMN tenants.domain IS 'Tenant domain (e.g., shop.ai, partner.nl)';
COMMENT ON COLUMN tenants.branding IS 'JSON object containing logo, colors, etc.';
