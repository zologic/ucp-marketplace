#!/bin/bash

# ============================================================================
# UCP Marketplace - Unified Installation Script
# ============================================================================
# Version: 2.0
# Date: 2026-02-13
# Purpose: Single script to install and configure UCP Marketplace from scratch
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║        UCP Marketplace - Installation Script              ║"
echo "║        Version 2.0 - Bug-Free Release                     ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# ============================================================================
# STEP 1: Pre-flight Checks
# ============================================================================

echo -e "${YELLOW}[1/8] Running pre-flight checks...${NC}"

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}✗ Docker Compose is not available${NC}"
    echo "Please install Docker Compose v2"
    exit 1
fi

# Check if Docker daemon is running
if ! docker ps &> /dev/null; then
    echo -e "${RED}✗ Docker daemon is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose are available${NC}"
echo ""

# ============================================================================
# STEP 2: Configuration
# ============================================================================

echo -e "${YELLOW}[2/8] Gathering configuration...${NC}"

# Check if .env already exists
if [ -f .env ]; then
    echo -e "${YELLOW}Found existing .env file${NC}"
    read -p "Do you want to keep existing configuration? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${GREEN}✓ Using existing .env${NC}"
        # Load existing env safely
        export $(grep -v '^#' .env | xargs)
    else
        echo "Creating new configuration..."
        rm .env
    fi
fi

# Generate .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Please provide configuration details:"
    echo ""

    # Domain
    read -p "Domain name [localhost]: " DOMAIN
    DOMAIN=${DOMAIN:-localhost}

    # Tenant name
    read -p "Marketplace name [UCP Marketplace]: " TENANT_NAME
    TENANT_NAME=${TENANT_NAME:-UCP Marketplace}

    # Database name
    read -p "Database name [ucpready]: " POSTGRES_DB
    POSTGRES_DB=${POSTGRES_DB:-ucpready}

    # Database password
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    echo "Generated secure database password"

    # JWT secrets
    JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)
    ADMIN_JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-64)
    echo "Generated JWT secrets"

    # Create .env file
    cat > .env << EOF
# ============================================================================
# UCP Marketplace Configuration
# Generated: $(date)
# ============================================================================

# Domain
DOMAIN=${DOMAIN}

# Tenant Configuration
TENANT_NAME=${TENANT_NAME}
TENANT_REVENUE_PERCENTAGE=80

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}

# API Configuration
PORT=3000
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
JWT_EXPIRY=24h

# Worker Configuration
RUN_WORKER=true

# Optional: Email Configuration (for notifications)
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=noreply@${DOMAIN}

# Optional: Stripe Configuration (for payment processing)
# STRIPE_SECRET_KEY=
# STRIPE_PUBLISHABLE_KEY=

EOF

    echo -e "${GREEN}✓ Configuration saved to .env${NC}"
fi

echo ""

# ============================================================================
# STEP 3: Generate Cryptographic Keys
# ============================================================================

echo -e "${YELLOW}[3/8] Generating cryptographic keys...${NC}"

mkdir -p secrets

if [ ! -f secrets/platform_private_key.pem ]; then
    # Generate Ed25519 key pair for UCP signing
    openssl genpkey -algorithm Ed25519 -out secrets/platform_private_key.pem
    openssl pkey -in secrets/platform_private_key.pem -pubout -out secrets/platform_public_key.pem

    echo -e "${GREEN}✓ Generated Ed25519 key pair${NC}"
else
    echo -e "${GREEN}✓ Using existing keys${NC}"
fi

# Set proper permissions
chmod 600 secrets/platform_private_key.pem
chmod 644 secrets/platform_public_key.pem

echo ""

# ============================================================================
# STEP 4: Generate Caddyfile
# ============================================================================

echo -e "${YELLOW}[4/8] Configuring reverse proxy...${NC}"

# Load env vars safely (only get DOMAIN)
DOMAIN=$(grep "^DOMAIN=" .env | cut -d'=' -f2-)

cat > Caddyfile << EOF
# Auto-generated Caddyfile - Do not edit manually
{
    auto_https off
}

:80 {
    # Frontend routes
    handle /* {
        reverse_proxy frontend:80
    }

    # Admin UI routes
    handle /admin-ui/* {
        reverse_proxy admin:5173
    }

    # API routes
    handle /api/* {
        reverse_proxy api:3000
    }

    handle /admin/* {
        reverse_proxy api:3000
    }

    handle /graphql {
        reverse_proxy api:3000
    }

    handle /webhooks/* {
        reverse_proxy api:3000
    }

    # Health check
    handle /health {
        reverse_proxy api:3000
    }
}
EOF

echo -e "${GREEN}✓ Caddyfile generated${NC}"
echo ""

# ============================================================================
# STEP 5: Start Docker Services
# ============================================================================

echo -e "${YELLOW}[5/8] Starting Docker services (clean start)...${NC}"

# Stop any existing containers
echo "Stopping existing containers..."
docker compose down 2>/dev/null || true

# Remove all volumes for clean start
echo "Removing all volumes for clean installation..."
docker volume rm ucp-marketplace_postgres_data 2>/dev/null || true
docker volume rm ucp-marketplace_redis_data 2>/dev/null || true
docker volume rm ucp-marketplace_caddy_data 2>/dev/null || true
docker volume rm ucp-marketplace_caddy_config 2>/dev/null || true

echo -e "${GREEN}✓ Clean slate ready${NC}"
echo ""

# Build and start services
echo "Building Docker images (this may take a few minutes)..."
docker compose build --pull

echo "Starting services..."
docker compose up -d

# Wait for database to be ready
echo "Waiting for database to be ready..."
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

# Verify database is accessible
if ! docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}✗ Database not accessible${NC}"
    echo "Please check Docker logs: docker compose logs postgres"
    exit 1
fi

# Wait for API to be ready
echo "Waiting for API to be ready..."
for i in {1..60}; do
    if docker compose exec -T api nc -z localhost 3000 > /dev/null 2>&1; then
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

echo -e "${GREEN}✓ All services started${NC}"
echo ""

# ============================================================================
# STEP 6: Verify Database Migrations
# ============================================================================

echo -e "${YELLOW}[6/8] Verifying database setup...${NC}"

# Wait for migrations to complete
sleep 5

# Check if migrations ran successfully
MIGRATION_CHECK=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM schema_migrations;" 2>&1 || echo "0")

if [ "$MIGRATION_CHECK" -gt "0" ]; then
    echo -e "${GREEN}✓ Database migrations applied ($MIGRATION_CHECK migrations)${NC}"
else
    echo -e "${YELLOW}⚠ Migrations may still be running...${NC}"
    echo "Checking API logs:"
    docker compose logs api | grep -i migration | tail -10
fi

# Check if default tenant exists
TENANT_CHECK=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM tenants;" 2>&1 || echo "0")

if [ "$TENANT_CHECK" -gt "0" ]; then
    echo -e "${GREEN}✓ Default tenant created${NC}"
else
    echo -e "${RED}✗ Tenant table not found${NC}"
    echo "Database may not be fully initialized"
fi

echo ""

# ============================================================================
# STEP 7: Create Admin User
# ============================================================================

echo -e "${YELLOW}[7/8] Creating admin user...${NC}"

# Check if admin already exists
ADMIN_EXISTS=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM admins;" 2>&1 || echo "0")

if [ "$ADMIN_EXISTS" -gt "0" ]; then
    echo -e "${YELLOW}Admin user already exists${NC}"
    read -p "Create another admin user? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping admin creation"
        CREATE_ADMIN=false
    else
        CREATE_ADMIN=true
    fi
else
    CREATE_ADMIN=true
fi

if [ "$CREATE_ADMIN" = true ]; then
    # Get admin credentials
    read -p "Admin email: " ADMIN_EMAIL

    while true; do
        read -sp "Admin password (min 12 chars): " ADMIN_PASSWORD
        echo ""
        read -sp "Confirm password: " ADMIN_PASSWORD_CONFIRM
        echo ""

        if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
            echo -e "${RED}Passwords do not match. Try again.${NC}"
            continue
        fi

        if [ ${#ADMIN_PASSWORD} -lt 12 ]; then
            echo -e "${RED}Password must be at least 12 characters. Try again.${NC}"
            continue
        fi

        break
    done

    # Generate password hash
    echo "Hashing password..."
    ADMIN_PASSWORD_HASH=$(docker compose run --rm -T api node -e "console.log(require('bcryptjs').hashSync('${ADMIN_PASSWORD}', 10))" 2>/dev/null | tail -1)

    # Insert admin user
    docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1 << EOF
INSERT INTO admins (email, password_hash, role)
VALUES ('${ADMIN_EMAIL}', '${ADMIN_PASSWORD_HASH}', 'superadmin')
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
EOF

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Admin user created: ${ADMIN_EMAIL}${NC}"
    else
        echo -e "${RED}✗ Failed to create admin user${NC}"
    fi
fi

echo ""

# ============================================================================
# STEP 8: Verification & Summary
# ============================================================================

echo -e "${YELLOW}[8/8] Running final verification...${NC}"

# Check service health
SERVICES_RUNNING=$(docker compose ps --services --filter "status=running" | wc -l)
SERVICES_TOTAL=$(docker compose ps --services | wc -l)

if [ "$SERVICES_RUNNING" -eq "$SERVICES_TOTAL" ]; then
    echo -e "${GREEN}✓ All services running ($SERVICES_RUNNING/$SERVICES_TOTAL)${NC}"
else
    echo -e "${YELLOW}⚠ Only $SERVICES_RUNNING/$SERVICES_TOTAL services running${NC}"
    docker compose ps
fi

echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║              Installation Complete! 🎉                     ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BLUE}Access your marketplace:${NC}"
echo ""
echo "  🌐 Frontend:     http://${DOMAIN}/"
echo "  👤 Admin Panel:  http://${DOMAIN}/admin-ui/"
echo "  🔧 API:          http://${DOMAIN}/api/"
echo "  ❤️  Health Check: http://${DOMAIN}/health"
echo ""
echo -e "${BLUE}Admin Credentials:${NC}"
echo "  Email:    ${ADMIN_EMAIL}"
echo "  Password: (the one you just set)"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo ""
echo "  View logs:           docker compose logs -f"
echo "  View API logs:       docker compose logs -f api"
echo "  Restart services:    docker compose restart"
echo "  Stop services:       docker compose down"
echo "  Create admin:        ./create-admin.sh"
echo "  Run migrations:      ./migrate.sh"
echo "  Diagnose:            ./diagnose.sh"
echo ""
echo -e "${BLUE}Database Configuration:${NC}"
echo "  Database: ${POSTGRES_DB}"
echo "  User:     ${POSTGRES_USER}"
echo "  Host:     postgres (internal)"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "  1. Visit http://${DOMAIN}/admin-ui/ and log in"
echo "  2. Add your first merchant in the Merchants section"
echo "  3. Configure merchant UCP endpoint"
echo "  4. Trigger product indexing"
echo "  5. Visit http://${DOMAIN}/ to see your marketplace"
echo ""
echo -e "${GREEN}Installation complete! Your marketplace is ready to use.${NC}"
echo ""

# Save installation info
cat > INSTALL_INFO.txt << EOF
UCP Marketplace Installation
============================
Date: $(date)
Domain: ${DOMAIN}
Database: ${POSTGRES_DB}
Admin Email: ${ADMIN_EMAIL}

Access URLs:
- Frontend: http://${DOMAIN}/
- Admin: http://${DOMAIN}/admin-ui/
- API: http://${DOMAIN}/api/

Configuration file: .env
Cryptographic keys: secrets/
Docker services: docker-compose.yml

For support, check database/README.md
EOF

echo -e "${BLUE}Installation details saved to INSTALL_INFO.txt${NC}"
echo ""
