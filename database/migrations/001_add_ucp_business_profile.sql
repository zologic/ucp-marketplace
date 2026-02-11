-- Migration: Add UCP business profile columns
-- Purpose: Support new UCP manifest schema with business_profile, services, capabilities, signing_keys
-- Date: 2026-02-11

-- Add business profile columns
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS business_name VARCHAR(255);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS business_url VARCHAR(500);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);

-- Add base_url for dynamic endpoint construction
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS service_base_url VARCHAR(500);

-- Add key_id for signing key identification
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS signing_key_id VARCHAR(255);

-- Store full manifest as JSONB for future flexibility
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ucp_manifest JSONB;

-- Add index on JSONB for capability queries (future optimization)
CREATE INDEX IF NOT EXISTS idx_merchants_ucp_manifest ON merchants USING GIN (ucp_manifest);

-- Add comments
COMMENT ON COLUMN merchants.ucp_manifest IS 'Full UCP manifest from .well-known/ucp endpoint';
COMMENT ON COLUMN merchants.service_base_url IS 'Base URL for REST API endpoints (from services.transports.base_url)';
COMMENT ON COLUMN merchants.business_name IS 'Business name from UCP business_profile';
COMMENT ON COLUMN merchants.business_description IS 'Business description from UCP business_profile';
COMMENT ON COLUMN merchants.business_url IS 'Business URL from UCP business_profile';
COMMENT ON COLUMN merchants.contact_email IS 'Contact email from UCP business_profile.contact';
COMMENT ON COLUMN merchants.signing_key_id IS 'Key ID (kid) from signing_keys array';
