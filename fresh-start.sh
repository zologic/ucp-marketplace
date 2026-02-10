#!/bin/bash

echo "=== UCP Marketplace - Fresh Start ==="
echo ""
echo "This will:"
echo "  1. Stop all containers"
echo "  2. Remove all volumes (database data)"
echo "  3. Clean up old .env and keys"
echo "  4. Prepare for fresh setup.sh run"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "[1/5] Stopping all containers..."
docker compose down

echo ""
echo "[2/5] Removing all volumes (database data)..."
docker compose down -v

echo ""
echo "[3/5] Removing old .env file..."
rm -f .env

echo ""
echo "[4/5] Removing old cryptographic keys..."
rm -f secrets/platform_private_key.pem
rm -f secrets/platform_public_key.pem

echo ""
echo "[5/5] Cleaning up Docker images (optional)..."
read -p "Remove old Docker images to force rebuild? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose down --rmi all
    echo "✓ Images removed"
else
    echo "✓ Images kept"
fi

echo ""
echo "=========================================="
echo "✓ Fresh start complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Run: ./setup.sh"
echo "  2. Follow the prompts"
echo "  3. Access admin at: https://bizform.app/admin-ui/login"
echo ""
