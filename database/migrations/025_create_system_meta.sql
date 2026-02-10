-- Create system_meta table for version tracking and system configuration
-- Used by setup.sh and upgrade.sh for managing system versions
CREATE TABLE IF NOT EXISTS system_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_meta_updated ON system_meta(updated_at DESC);

-- Insert initial system metadata
-- These values will be updated by setup.sh during installation
INSERT INTO system_meta (key, value, updated_at)
VALUES
    ('schema_version', '25', NOW()),
    ('app_version', 'initial', NOW()),
    ('last_upgrade', NOW()::TEXT, NOW()),
    ('installation_date', NOW()::TEXT, NOW())
ON CONFLICT (key) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE system_meta IS 'System metadata and version tracking for upgrades';
COMMENT ON COLUMN system_meta.key IS 'Metadata key (e.g., schema_version, app_version, last_upgrade)';
COMMENT ON COLUMN system_meta.value IS 'Metadata value (stored as text for flexibility)';
COMMENT ON COLUMN system_meta.updated_at IS 'Timestamp of last update to this metadata entry';
