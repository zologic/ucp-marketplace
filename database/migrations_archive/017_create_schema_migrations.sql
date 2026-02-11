-- Create schema_migrations table to track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_file TEXT UNIQUE NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE schema_migrations IS 'Track applied database migrations';
