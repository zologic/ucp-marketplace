-- Create merchant_billing table for billing configuration per merchant
CREATE TABLE IF NOT EXISTS merchant_billing (
    merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    billing_mode VARCHAR(20) NOT NULL DEFAULT 'commission' CHECK (billing_mode IN ('commission', 'cpc', 'freemium')),
    commission_percent INTEGER CHECK (commission_percent >= 0 AND commission_percent <= 100),
    cpc_cents INTEGER CHECK (cpc_cents >= 0),
    plugin_fee_cents INTEGER DEFAULT 0 CHECK (plugin_fee_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'overdue', 'suspended')),
    grace_period_days INTEGER NOT NULL DEFAULT 7 CHECK (grace_period_days >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_merchant_billing_status ON merchant_billing(status);

-- Comments
COMMENT ON TABLE merchant_billing IS 'Billing configuration per merchant';
COMMENT ON COLUMN merchant_billing.billing_mode IS 'commission, cpc, or freemium';
COMMENT ON COLUMN merchant_billing.commission_percent IS 'Percentage for commission mode (0-100)';
COMMENT ON COLUMN merchant_billing.cpc_cents IS 'Cost per click in cents';
