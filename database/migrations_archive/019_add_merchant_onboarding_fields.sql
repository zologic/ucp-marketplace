-- Add onboarding-specific fields to merchants table
ALTER TABLE merchants
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS detection_data JSONB,
ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_detection_at TIMESTAMP;

-- Update status constraint to include onboarding states
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_status_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_status_check
    CHECK (status IN (
        'pending',
        'verified',
        'active',
        'suspended',
        'pending_plugin',
        'pending_activation',
        'pending_verification',
        'unsupported'
    ));

-- Index for onboarding queue (admin view)
CREATE INDEX IF NOT EXISTS idx_merchants_onboarding_status
    ON merchants(tenant_id, status)
    WHERE status IN ('pending_plugin', 'pending_activation', 'pending_verification', 'unsupported');

-- Comments
COMMENT ON COLUMN merchants.contact_email IS 'Email from onboarding form for follow-up';
COMMENT ON COLUMN merchants.detection_data IS 'WooCommerce/UCPReady detection results';
COMMENT ON COLUMN merchants.first_seen_at IS 'When merchant first submitted onboarding form';
COMMENT ON COLUMN merchants.last_detection_at IS 'Last time store detection ran';
COMMENT ON COLUMN merchants.status IS 'Status: pending, verified, active, suspended, pending_plugin, pending_activation, pending_verification, unsupported';
