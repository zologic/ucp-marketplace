-- Create billable_events table for immutable event log for billing calculations
CREATE TABLE IF NOT EXISTS billable_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('click', 'order')),
    reference_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
    invoiced BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes
CREATE INDEX idx_billable_events_merchant_invoiced_occurred ON billable_events(merchant_id, invoiced, occurred_at);
CREATE INDEX idx_billable_events_reference ON billable_events(reference_id);
CREATE INDEX idx_billable_events_occurred ON billable_events(occurred_at);

-- Comments
COMMENT ON TABLE billable_events IS 'Immutable event log for billing calculations';
COMMENT ON COLUMN billable_events.event_type IS 'click=CPC billing, order=commission billing';
COMMENT ON COLUMN billable_events.invoiced IS 'TRUE when included in an invoice';
