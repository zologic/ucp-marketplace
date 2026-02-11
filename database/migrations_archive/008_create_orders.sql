-- Create orders table for authoritative order records from merchant webhooks
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    checkout_session_id UUID REFERENCES checkout_sessions(id) ON DELETE SET NULL,
    referral_id TEXT UNIQUE NOT NULL,
    merchant_order_id TEXT NOT NULL,
    revenue_cents INTEGER NOT NULL CHECK (revenue_cents >= 0),
    currency VARCHAR(3) NOT NULL,
    webhook_signature TEXT,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_orders_referral ON orders(referral_id);
CREATE INDEX idx_orders_tenant_merchant_created ON orders(tenant_id, merchant_id, created_at);
CREATE INDEX idx_orders_merchant_order ON orders(merchant_order_id);

-- Comments
COMMENT ON TABLE orders IS 'Authoritative order records from verified webhooks (billing source of truth)';
COMMENT ON COLUMN orders.verified IS 'TRUE if webhook signature verified';
