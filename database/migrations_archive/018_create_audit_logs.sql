-- Create audit_logs table for tracking admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Comments
COMMENT ON TABLE audit_logs IS 'Audit trail of admin actions';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (e.g., merchant_activated, tenant_created)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (merchant, tenant, admin, invoice)';
COMMENT ON COLUMN audit_logs.details IS 'JSON object with additional context';
