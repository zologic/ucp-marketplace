-- Create revenue_splits table for immutable revenue split ledger
CREATE TABLE IF NOT EXISTS revenue_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billable_event_id UUID NOT NULL REFERENCES billable_events(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    tenant_cents INTEGER NOT NULL CHECK (tenant_cents >= 0),
    platform_cents INTEGER NOT NULL CHECK (platform_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_revenue_splits_tenant_created ON revenue_splits(tenant_id, created_at);
CREATE UNIQUE INDEX idx_revenue_splits_billable_event ON revenue_splits(billable_event_id);

-- Comments
COMMENT ON TABLE revenue_splits IS 'Immutable revenue split ledger for white-label partners';
COMMENT ON COLUMN revenue_splits.tenant_cents IS 'Partner share';
COMMENT ON COLUMN revenue_splits.platform_cents IS 'Platform share';
