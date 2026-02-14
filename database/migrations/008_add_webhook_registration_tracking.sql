-- Migration: Add webhook registration tracking to merchants table
-- Purpose: Track webhook registration status with merchant plugins
-- Date: 2026-02-14

-- Add webhook registration tracking columns to merchants table
ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS webhook_registered BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS webhook_url TEXT,
    ADD COLUMN IF NOT EXISTS webhook_registered_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS webhook_status VARCHAR(50) DEFAULT 'not_registered',
    ADD COLUMN IF NOT EXISTS webhook_error TEXT;

-- Add index for webhook status queries
CREATE INDEX IF NOT EXISTS idx_merchants_webhook_status ON merchants(webhook_status);
CREATE INDEX IF NOT EXISTS idx_merchants_webhook_registered ON merchants(webhook_registered);

-- Add comment
COMMENT ON COLUMN merchants.webhook_registered IS 'Whether webhook has been registered with merchant plugin';
COMMENT ON COLUMN merchants.webhook_id IS 'Webhook ID returned by merchant plugin';
COMMENT ON COLUMN merchants.webhook_url IS 'Marketplace webhook URL registered with merchant';
COMMENT ON COLUMN merchants.webhook_registered_at IS 'Timestamp when webhook was registered';
COMMENT ON COLUMN merchants.webhook_status IS 'Webhook registration status: not_registered, active, failed, unregistered';
COMMENT ON COLUMN merchants.webhook_error IS 'Last webhook registration error message';
