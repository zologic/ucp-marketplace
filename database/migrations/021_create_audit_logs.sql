-- Create audit_logs table for admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- Comments
COMMENT ON TABLE audit_logs IS 'Audit trail for admin actions';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (e.g., cpc_billing_enabled, merchant_suspended)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource (e.g., merchant, tenant)';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of affected resource';
COMMENT ON COLUMN audit_logs.details IS 'Additional context (JSON)';
