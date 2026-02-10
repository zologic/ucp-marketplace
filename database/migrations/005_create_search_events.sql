-- Create search_events table for tracking normalized search intents (GDPR-safe)
CREATE TABLE IF NOT EXISTS search_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    intent_hash TEXT NOT NULL,
    category TEXT,
    brand TEXT,
    max_price_cents INTEGER,
    currency VARCHAR(3),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_search_events_tenant_merchant_created ON search_events(tenant_id, merchant_id, created_at);
CREATE INDEX idx_search_events_intent_hash ON search_events(intent_hash);
CREATE INDEX idx_search_events_created ON search_events(created_at);

-- Comments
COMMENT ON TABLE search_events IS 'Normalized search intents (NO raw user queries stored)';
COMMENT ON COLUMN search_events.intent_hash IS 'SHA-256 hash of normalized intent for privacy';
