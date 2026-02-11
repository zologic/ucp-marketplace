-- Update audit_logs table indexes (migration 021 renamed to avoid conflict with 018)
-- This migration improves the indexes created in 018 by making them composite indexes

-- First, drop the old indexes if they exist
DROP INDEX IF EXISTS idx_audit_logs_admin;
DROP INDEX IF EXISTS idx_audit_logs_resource;
DROP INDEX IF EXISTS idx_audit_logs_created_at;
DROP INDEX IF EXISTS idx_audit_logs_action;

-- Make resource_id nullable if it's not already (safe to run multiple times)
ALTER TABLE audit_logs ALTER COLUMN resource_id DROP NOT NULL;

-- Make details column nullable with no default (safe to run multiple times)
ALTER TABLE audit_logs ALTER COLUMN details DROP DEFAULT;

-- Create improved composite indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_time ON audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_time ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time ON audit_logs(action, created_at DESC);

-- Update comments
COMMENT ON TABLE audit_logs IS 'Audit trail for admin actions';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (e.g., cpc_billing_enabled, merchant_suspended)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource (e.g., merchant, tenant)';
COMMENT ON COLUMN audit_logs.resource_id IS 'ID of affected resource (nullable for system-wide actions)';
COMMENT ON COLUMN audit_logs.details IS 'Additional context (JSON)';
