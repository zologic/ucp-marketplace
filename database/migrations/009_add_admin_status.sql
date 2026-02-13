-- Migration 009: Add status and last_login columns to admins table
--
-- Adds status tracking and last login timestamp for admin accounts

-- Add status column
ALTER TABLE admins
ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'inactive'));

-- Add last_login column
ALTER TABLE admins
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admins_status ON admins(status);
CREATE INDEX IF NOT EXISTS idx_admins_last_login ON admins(last_login DESC);

-- Add comments
COMMENT ON COLUMN admins.status IS 'Admin account status: active or inactive';
COMMENT ON COLUMN admins.last_login IS 'Timestamp of last successful login';

-- Set all existing admins to active status
UPDATE admins SET status = 'active' WHERE status IS NULL;
