#!/bin/bash

# UCP Marketplace Migration Runner
# Automatically runs database migrations and rebuilds services

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🗄️  UCP Marketplace Migration Runner"
echo "===================================="
echo ""

# Get database configuration from environment or defaults
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-ucpready}

echo "Using database: $POSTGRES_DB"
echo ""

# Check if Docker is running
if ! docker compose ps > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker Compose is not available or services are not running${NC}"
    exit 1
fi

# Function to run migrations
run_migrations() {
    echo -e "${YELLOW}📦 Running database migrations...${NC}"

    MIGRATION_DIR="database/migrations"

    if [ ! -d "$MIGRATION_DIR" ]; then
        echo -e "${RED}❌ Migration directory not found: $MIGRATION_DIR${NC}"
        exit 1
    fi

    # Get list of migration files sorted by name
    MIGRATIONS=$(ls -1 "$MIGRATION_DIR"/*.sql 2>/dev/null | sort)

    if [ -z "$MIGRATIONS" ]; then
        echo -e "${YELLOW}⚠️  No migration files found${NC}"
        return 0
    fi

    # Run each migration
    for MIGRATION in $MIGRATIONS; do
        MIGRATION_NAME=$(basename "$MIGRATION")
        echo -e "  ${GREEN}→${NC} Running $MIGRATION_NAME..."

        # Copy migration to postgres container
        docker compose cp "$MIGRATION" postgres:/tmp/current_migration.sql

        # Run migration and capture output
        OUTPUT=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/current_migration.sql 2>&1)
        EXIT_CODE=$?

        if [ $EXIT_CODE -eq 0 ]; then
            echo -e "    ${GREEN}✓${NC} $MIGRATION_NAME completed"
        else
            # Check if it's already applied (duplicate column/index errors are OK)
            if echo "$OUTPUT" | grep -qE "already exists|duplicate"; then
                echo -e "    ${YELLOW}⊙${NC} $MIGRATION_NAME already applied (skipped)"
            else
                echo -e "    ${RED}✗${NC} $MIGRATION_NAME failed"
                echo "$OUTPUT"
                exit 1
            fi
        fi
    done

    echo -e "${GREEN}✓ All migrations completed${NC}"
    echo ""
}

# Function to rebuild and restart services
rebuild_services() {
    echo -e "${YELLOW}🔨 Rebuilding services...${NC}"

    docker compose build --no-cache frontend admin api 2>&1 | grep -E "^#|=>" || true

    echo -e "${GREEN}✓ Services rebuilt${NC}"
    echo ""
}

restart_services() {
    echo -e "${YELLOW}🔄 Restarting services...${NC}"

    docker compose up -d frontend admin api

    echo -e "${GREEN}✓ Services restarted${NC}"
    echo ""
}

show_status() {
    echo -e "${YELLOW}📊 Service Status:${NC}"
    docker compose ps
    echo ""
}

# Main execution
echo "Step 1: Running migrations"
echo "-------------------------"
run_migrations

echo "Step 2: Rebuild services?"
echo "-------------------------"
echo "This will rebuild frontend, admin, and api containers"
read -p "Continue? [Y/n] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    rebuild_services
    restart_services

    echo "Waiting for services to stabilize..."
    sleep 5

    show_status

    echo -e "${GREEN}✅ Migration and deployment complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  - Check logs: docker compose logs -f api"
    echo "  - Test admin user creation"
    echo "  - Test product variation pricing"
    echo "  - Complete a test purchase to verify referral tracking"
else
    echo -e "${YELLOW}⚠️  Skipped rebuild. Services are running with old code.${NC}"
    echo ""
    echo "To apply code changes, run:"
    echo "  docker compose up -d --build frontend admin api"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
