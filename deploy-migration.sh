#!/bin/bash
################################################################################

# Get database configuration from environment or defaults
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-ucpready}

# Load from .env if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Deploy Migration 002: Product Variations
# Purpose: Safe deployment script for production environment
################################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0;m'

echo -e "${BLUE}========================================="
echo "Migration 002: Product Variations"
echo "=========================================${NC}\n"

# Step 1: Verify backup exists
echo -e "${YELLOW}[1/5] Verifying backup...${NC}"
if [ ! -f "backup.sql" ]; then
    echo -e "${RED}✗ backup.sql not found!${NC}"
    echo "Please run: docker compose exec postgres pg_dump -U "$POSTGRES_USER" ucpready > backup.sql"
    exit 1
fi

BACKUP_SIZE=$(stat -f%z "backup.sql" 2>/dev/null || stat -c%s "backup.sql" 2>/dev/null)
if [ "$BACKUP_SIZE" -lt 1000 ]; then
    echo -e "${RED}✗ Backup file too small (${BACKUP_SIZE} bytes)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Backup verified ($(numfmt --to=iec $BACKUP_SIZE 2>/dev/null || echo "${BACKUP_SIZE} bytes"))${NC}\n"

# Step 2: Apply migration
echo -e "${YELLOW}[2/5] Applying migration...${NC}"

# Use -T flag to avoid TTY error
cat database/migrations/002_add_product_variations.sql | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Migration applied successfully${NC}\n"
else
    echo -e "${RED}✗ Migration failed!${NC}"
    echo "To rollback: cat backup.sql | docker compose exec -T postgres psql -U "$POSTGRES_USER" ucpready"
    exit 1
fi

# Step 3: Verify new columns
echo -e "${YELLOW}[3/5] Verifying database schema...${NC}"

VERIFY_RESULT=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'products'
    AND column_name IN ('description_short', 'description_long', 'variations', 'has_variations', 'search_vector')
    ORDER BY column_name;
" | grep -E 'description_short|description_long|variations|has_variations|search_vector' | wc -l)

if [ "$VERIFY_RESULT" -eq 5 ]; then
    echo -e "${GREEN}✓ All 5 columns added successfully${NC}"
    echo "  - description_short"
    echo "  - description_long"
    echo "  - variations"
    echo "  - has_variations"
    echo "  - search_vector"
else
    echo -e "${RED}✗ Only $VERIFY_RESULT of 5 columns found${NC}"
    exit 1
fi

# Verify indexes
echo -e "\n${YELLOW}Verifying indexes...${NC}"
INDEXES=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'products'
    AND indexname LIKE '%variation%' OR indexname LIKE '%search_vector%';
")

echo "$INDEXES" | grep -q "idx_products_has_variations" && echo -e "${GREEN}✓ idx_products_has_variations${NC}"
echo "$INDEXES" | grep -q "idx_products_variations_gin" && echo -e "${GREEN}✓ idx_products_variations_gin${NC}"
echo "$INDEXES" | grep -q "idx_products_search_vector" && echo -e "${GREEN}✓ idx_products_search_vector${NC}"

# Step 4: Restart services
echo -e "\n${YELLOW}[4/5] Restarting services...${NC}"

# Check which services exist
SERVICES=$(docker compose config --services)

echo "Available services:"
echo "$SERVICES" | sed 's/^/  - /'

# Restart API and frontend (worker may not exist in all setups)
if echo "$SERVICES" | grep -q "^api$"; then
    docker compose restart api
    echo -e "${GREEN}✓ Restarted api${NC}"
fi

if echo "$SERVICES" | grep -q "^frontend$"; then
    docker compose restart frontend
    echo -e "${GREEN}✓ Restarted frontend${NC}"
fi

if echo "$SERVICES" | grep -q "^worker$"; then
    docker compose restart worker
    echo -e "${GREEN}✓ Restarted worker${NC}"
fi

# Wait for services to be healthy
echo -e "\n${YELLOW}Waiting for services to be ready...${NC}"
sleep 5

# Step 5: Quick verification
echo -e "\n${YELLOW}[5/5] Running quick verification...${NC}"

# Check if API is responding
API_URL="http://localhost:3000/api/search"
if command -v curl >/dev/null 2>&1; then
    RESPONSE=$(curl -sf -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d '{"query":"test"}' 2>/dev/null || echo "")

    if [ -n "$RESPONSE" ]; then
        echo -e "${GREEN}✓ API is responding${NC}"

        # Check if response includes new fields
        if echo "$RESPONSE" | grep -q "description_short"; then
            echo -e "${GREEN}✓ New fields present in API response${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Could not verify API response (may need public endpoint)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ curl not available for API verification${NC}"
fi

# Summary
echo -e "\n${GREEN}========================================="
echo "✅ Migration Completed Successfully"
echo "=========================================${NC}\n"

echo "Next steps:"
echo "  1. Run integration test: ./test-variation-to-vault.sh"
echo "  2. Monitor logs: docker compose logs -f api"
echo "  3. Check search performance in database"
echo "  4. Test in browser: search for products"
echo ""
echo "Rollback (if needed):"
echo "  cat backup.sql | docker compose exec -T postgres psql -U "$POSTGRES_USER" ucpready"
echo ""
