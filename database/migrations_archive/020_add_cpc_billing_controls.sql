-- Add CPC billing controls to merchants table
-- CPC tracking is always ON, but billing is OFF by default

ALTER TABLE merchants
ADD COLUMN IF NOT EXISTS cpc_billing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cpc_enabled_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS cpc_rate NUMERIC(10,2) NULL;

-- Index for billing queries (only enabled merchants)
CREATE INDEX IF NOT EXISTS idx_merchants_cpc_enabled
    ON merchants(tenant_id, cpc_billing_enabled)
    WHERE cpc_billing_enabled = TRUE;

-- Comments
COMMENT ON COLUMN merchants.cpc_billing_enabled IS 'CPC billing toggle (OFF by default, admin-controlled)';
COMMENT ON COLUMN merchants.cpc_enabled_at IS 'When CPC billing was last enabled (for non-retroactive billing)';
COMMENT ON COLUMN merchants.cpc_rate IS 'CPC rate in minor units (e.g., 20 = €0.20 per click)';

-- Important: CPC events are ALWAYS tracked in click_events and billable_events
-- This column only controls whether CPC events are included in invoices
