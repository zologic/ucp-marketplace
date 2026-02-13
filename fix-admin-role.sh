#!/bin/bash

echo "Updating all admins to superadmin role..."

docker compose exec -T postgres psql -U postgres -d marketplace << 'EOF'
-- Update all admin users to superadmin
UPDATE admins SET role = 'superadmin' WHERE role = 'admin';

-- Show current admins
SELECT id, email, role, created_at FROM admins;
EOF

echo "Done!"
