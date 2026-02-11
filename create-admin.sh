#!/bin/bash

# Simple script to create admin user for running system

echo "=== Create Admin User ==="
echo ""

# Get admin email
read -p "Admin email: " ADMIN_EMAIL

# Get admin password (hidden input)
read -sp "Admin password (min 12 chars): " ADMIN_PASSWORD
echo ""
read -sp "Confirm password: " ADMIN_PASSWORD_CONFIRM
echo ""

# Check password match
if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
    echo "ERROR: Passwords do not match"
    exit 1
fi

# Check password length
if [ ${#ADMIN_PASSWORD} -lt 12 ]; then
    echo "ERROR: Password must be at least 12 characters"
    exit 1
fi

echo ""
echo "Creating admin user..."

# Generate bcrypt hash
ADMIN_PASSWORD_HASH=$(docker compose run --rm -T api node -e "console.log(require('bcryptjs').hashSync('${ADMIN_PASSWORD}', 10))" 2>/dev/null | tail -1)

if [ -z "$ADMIN_PASSWORD_HASH" ]; then
    echo "ERROR: Failed to hash password"
    exit 1
fi

# Get postgres password from running container env
POSTGRES_PASSWORD=$(docker compose exec -T postgres printenv POSTGRES_PASSWORD)

# Insert admin user
RESULT=$(docker compose exec -T postgres psql -U postgres -d ucpready -t -A << EOF 2>&1
INSERT INTO admins (email, password_hash, role)
VALUES ('${ADMIN_EMAIL}', '${ADMIN_PASSWORD_HASH}', 'superadmin')
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
RETURNING id, email;
EOF
)

if [ $? -eq 0 ]; then
    echo "✓ Admin user created successfully!"
    echo "  Email: ${ADMIN_EMAIL}"
    echo "  Role: superadmin"
    echo ""
    echo "You can now log in to the admin dashboard at:"
    echo "  https://bizform.app/admin/"
else
    echo "ERROR: Failed to create admin user"
    echo "$RESULT"
    exit 1
fi
