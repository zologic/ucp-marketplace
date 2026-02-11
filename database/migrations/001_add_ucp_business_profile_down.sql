-- Rollback migration: Remove UCP business profile columns
-- Purpose: Rollback changes from 001_add_ucp_business_profile.sql

DROP INDEX IF EXISTS idx_merchants_ucp_manifest;
ALTER TABLE merchants DROP COLUMN IF EXISTS ucp_manifest;
ALTER TABLE merchants DROP COLUMN IF EXISTS signing_key_id;
ALTER TABLE merchants DROP COLUMN IF EXISTS service_base_url;
ALTER TABLE merchants DROP COLUMN IF EXISTS contact_email;
ALTER TABLE merchants DROP COLUMN IF EXISTS business_url;
ALTER TABLE merchants DROP COLUMN IF EXISTS business_description;
ALTER TABLE merchants DROP COLUMN IF EXISTS business_name;
