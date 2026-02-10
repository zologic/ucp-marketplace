-- Create click_events table for tracking product clicks
CREATE TABLE IF NOT EXISTS click_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    intent_hash TEXT,
    session_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_click_events_tenant_merchant_created ON click_events(tenant_id, merchant_id, created_at);
CREATE INDEX idx_click_events_session_product ON click_events(session_id, product_id);
CREATE INDEX idx_click_events_created ON click_events(created_at);

-- Comments
COMMENT ON TABLE click_events IS 'Product click tracking for analytics and CPC billing';
COMMENT ON COLUMN click_events.session_id IS 'For deduplication (same session+product within 5 min = 1 click)';
