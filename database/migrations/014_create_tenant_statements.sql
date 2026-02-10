-- Create tenant_statements table for payout statements for white-label partners
CREATE TABLE IF NOT EXISTS tenant_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    statement_number TEXT UNIQUE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_earned_cents INTEGER NOT NULL CHECK (total_earned_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid')),
    issued_at TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_tenant_statements_number ON tenant_statements(statement_number);
CREATE INDEX idx_tenant_statements_tenant_status ON tenant_statements(tenant_id, status);

-- Comments
COMMENT ON TABLE tenant_statements IS 'Payout statements for white-label partners';
COMMENT ON COLUMN tenant_statements.statement_number IS 'Unique statement identifier (e.g., STMT-2026-02-001)';
