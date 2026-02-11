#!/bin/bash
################################################################################
# Migration State Verification
# Purpose: Check if migration 002 already applied (fully or partially)
################################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================="
echo "Migration State Verification"
echo "=========================================${NC}\n"

# Check if columns exist
echo -e "${YELLOW}[1/3] Checking if new columns exist...${NC}"

COLUMNS_CHECK=$(docker compose exec -T postgres psql -U postgres -d ucpready -t -c "
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'products'
  AND column_name IN ('description_short', 'description_long', 'variations', 'has_variations', 'search_vector')
  ORDER BY column_name;
" 2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Could not connect to database${NC}"
    echo "Make sure containers are running: docker compose ps"
    exit 1
fi

COLUMN_COUNT=$(echo "$COLUMNS_CHECK" | grep -v "^$" | wc -l)

echo -e "Found ${COLUMN_COUNT}/5 expected columns:"
echo "$COLUMNS_CHECK" | grep -v "^$" | sed 's/^/  - /'

# Check indexes
echo -e "\n${YELLOW}[2/3] Checking if new indexes exist...${NC}"

INDEXES_CHECK=$(docker compose exec -T postgres psql -U postgres -d ucpready -t -c "
  SELECT indexname
  FROM pg_indexes
  WHERE tablename = 'products'
  AND (indexname LIKE '%variation%' OR indexname LIKE '%search_vector%')
  ORDER BY indexname;
" 2>&1)

INDEX_COUNT=$(echo "$INDEXES_CHECK" | grep -v "^$" | wc -l)

echo -e "Found ${INDEX_COUNT}/3 expected indexes:"
echo "$INDEXES_CHECK" | grep -v "^$" | sed 's/^/  - /'

# Determine state
echo -e "\n${YELLOW}[3/3] Migration Status${NC}"

if [ "$COLUMN_COUNT" -eq 5 ] && [ "$INDEX_COUNT" -eq 3 ]; then
    echo -e "${GREEN}✅ Migration COMPLETE${NC}"
    echo "All columns and indexes exist."
    echo ""
    echo "Next steps:"
    echo "  1. Restart services: docker compose restart api frontend"
    echo "  2. Run integration test: ./test-variation-to-vault.sh"
    exit 0
elif [ "$COLUMN_COUNT" -eq 0 ] && [ "$INDEX_COUNT" -eq 0 ]; then
    echo -e "${BLUE}⚠ Migration NOT APPLIED${NC}"
    echo "No migration columns or indexes found."
    echo ""
    echo "Next steps:"
    echo "  Run deployment script: ./deploy-migration.sh"
    echo "  OR manual: cat database/migrations/002_add_product_variations.sql | docker compose exec -T postgres psql -U postgres -d ucpready"
    exit 0
else
    echo -e "${YELLOW}⚠ Migration PARTIALLY APPLIED${NC}"
    echo "Found ${COLUMN_COUNT}/5 columns and ${INDEX_COUNT}/3 indexes"
    echo ""
    echo "This can happen if migration was interrupted."
    echo ""
    echo "Options:"
    echo "  A) Complete migration manually (apply missing pieces)"
    echo "  B) Rollback and reapply:"
    echo "     - Restore backup: cat backup.sql | docker compose exec -T postgres psql -U postgres ucpready"
    echo "     - Then run: ./deploy-migration.sh"
    echo ""
    echo "To see what's missing, compare output above with expected:"
    echo "  Columns: description_short, description_long, variations, has_variations, search_vector"
    echo "  Indexes: idx_products_has_variations, idx_products_variations_gin, idx_products_search_vector"
    exit 2
fi
