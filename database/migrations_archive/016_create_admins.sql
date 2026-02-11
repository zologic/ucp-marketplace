-- Create admins table for admin user accounts
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_admins_email ON admins(email);

-- Comments
COMMENT ON TABLE admins IS 'Admin user accounts for dashboard access';
COMMENT ON COLUMN admins.role IS 'superadmin=full access, admin=standard access';
