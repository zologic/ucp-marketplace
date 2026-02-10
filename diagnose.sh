#!/bin/bash

echo "=== UCP Marketplace Diagnostics ==="
echo ""

# Check if .env exists
echo "1. Checking .env file..."
if [ -f .env ]; then
    echo "   ✓ .env file exists"
else
    echo "   ✗ .env file MISSING - You need to run setup.sh first!"
    exit 1
fi

# Check if secrets exist
echo ""
echo "2. Checking cryptographic keys..."
if [ -f secrets/platform_private_key.pem ]; then
    echo "   ✓ Private key exists"
else
    echo "   ✗ Private key MISSING - You need to run setup.sh first!"
fi

if [ -f secrets/platform_public_key.pem ]; then
    echo "   ✓ Public key exists"
else
    echo "   ✗ Public key MISSING - You need to run setup.sh first!"
fi

# Check Docker services
echo ""
echo "3. Checking Docker services..."
docker compose ps

# Check API logs
echo ""
echo "4. Checking API logs (last 30 lines)..."
docker compose logs api --tail=30

# Check for database connection errors
echo ""
echo "5. Checking for database connection errors..."
docker compose logs api | grep -i "error\|failed\|cannot connect" | tail -20

# Check admin user exists
echo ""
echo "6. Checking if admin user exists in database..."
docker compose exec -T postgres psql -U ucpready -d ucpready -c "SELECT email, created_at FROM admins LIMIT 1;" 2>&1

echo ""
echo "=== Diagnostics Complete ==="
echo ""
echo "Next steps:"
echo "  - If .env or keys are missing: Run ./setup.sh"
echo "  - If API shows connection errors: Check DATABASE_URL in .env"
echo "  - If no admin user exists: Run setup.sh or create one manually"
echo "  - Admin dashboard: https://bizform.app/admin-ui/login"
