-- Create checkout_sessions table for tracking checkout session creation
CREATE TABLE IF NOT EXISTS checkout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    referral_id TEXT UNIQUE NOT NULL,
    session_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'completed', 'abandoned')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Indexes
CREATE UNIQUE INDEX idx_checkout_sessions_referral ON checkout_sessions(referral_id);
CREATE INDEX idx_checkout_sessions_tenant_merchant_status_created ON checkout_sessions(tenant_id, merchant_id, status, created_at);

-- Comments
COMMENT ON TABLE checkout_sessions IS 'Track checkout session creation before merchant redirect';
COMMENT ON COLUMN checkout_sessions.referral_id IS 'UUID embedded in checkout metadata for attribution';
