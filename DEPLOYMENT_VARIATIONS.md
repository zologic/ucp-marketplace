# Product Variations & Descriptions - Deployment Guide

## Implementation Summary

This update adds support for:
- **Product variations** (size, color, material, etc.) with per-option pricing
- **Separate description fields** (short for cards, long for detail pages)
- **Dynamic price updates** as users select variations
- **Full server-side validation** to prevent price manipulation

## Files Modified

### Database
- `database/migrations/002_add_product_variations.sql` (NEW)
  - Adds: `description_short`, `description_long`, `variations` (JSONB), `has_variations` (boolean)
  - Migrates existing `description` data to `description_long`
  - Creates indexes for performance

### Backend
- `worker/jobs/indexProducts.js`
  - Processes variation data from merchant UCP endpoints
  - Handles description field extraction and truncation
  - Validates variation structure before storage

- `api/routes/public.js`
  - Search endpoint returns new fields (description_short, variations, has_variations)
  - Checkout endpoint validates selected variations
  - Calculates final price with variation modifiers

### Frontend
- `frontend/js/ui.js`
  - Product cards display descriptions
  - Renders variation selector buttons
  - Updates price dynamically on selection
  - Stores selected variations in card data attributes

- `frontend/js/checkout.js`
  - Accepts `selectedVariations` parameter
  - Includes variations in checkout request
  - Handles variation-specific error codes

- `frontend/styles.css`
  - Styles for product descriptions
  - Variation selector buttons (selected/disabled states)
  - Increased card min-height to accommodate variations

## Deployment Steps

### Step 1: Backup Database
```bash
# Create backup before migration
docker-compose exec postgres pg_dump -U postgres ucpready > backup_pre_variations.sql
```

### Step 2: Run Migration
```bash
# Connect to database
docker-compose exec postgres psql -U postgres -d ucpready

# Run migration
\i /path/to/database/migrations/002_add_product_variations.sql

# Verify columns added
\d products

# Check indexes created
\di idx_products_has_variations
\di idx_products_variations_gin
```

### Step 3: Restart Services
```bash
# Restart all services to pick up code changes
docker-compose restart api worker frontend

# Verify services are running
docker-compose ps
```

### Step 4: Verification

#### Database Verification
```sql
-- Check new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'products'
AND column_name IN ('description_short', 'description_long', 'variations', 'has_variations');

-- Verify existing data migrated
SELECT COUNT(*) FROM products WHERE description_long IS NOT NULL;

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'products' AND indexname LIKE '%variation%';
```

#### API Verification
```bash
# Test search endpoint returns new fields
curl -X POST https://your-domain.com/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}' | jq '.results[0] | keys'

# Should include: description_short, variations, has_variations
```

#### Frontend Verification
- Open browser to marketplace
- Search for products
- Verify description appears below product name
- If product has variations, verify:
  - Variation options display
  - Selecting option updates visual state
  - Price updates when option with price modifier selected
  - Buy button passes variations to checkout

### Step 5: Run UCP Compliance Tests
```bash
# Run the existing test suite
cd /path/to/test-scripts
./test.sh

# All 10 tests should pass:
# 1. UCP Discovery
# 2. Products API
# 3. Product Search
# 4. Categories API
# 5. Cart Creation
# 6. Cart Retrieval
# 7. Checkout Session Creation
# 8. Continue URL Redirect
# 9. Idempotency Validation
# 10. Agent Attribution
```

## Testing Checklist

### Backend Testing
- [ ] Migration runs without errors
- [ ] Existing products still display correctly
- [ ] Products without variations work as before
- [ ] Search returns new fields
- [ ] Checkout accepts variations parameter
- [ ] Checkout rejects invalid variations
- [ ] Checkout rejects unavailable options
- [ ] Price calculation includes modifiers

### Frontend Testing
- [ ] Product cards display descriptions
- [ ] Variation selectors render correctly
- [ ] Clicking variation updates selection
- [ ] Price updates dynamically
- [ ] Disabled variations shown correctly
- [ ] Buy button includes variations
- [ ] Error messages display for invalid selections

### Integration Testing
- [ ] Product indexing worker processes variations
- [ ] Variations stored in database as JSONB
- [ ] Search full-text includes new description fields
- [ ] End-to-end checkout with variations completes
- [ ] Referral tracking still works

### Edge Cases
- [ ] Product with no variations displays normally
- [ ] Product with empty variations array handled
- [ ] Long descriptions truncated properly
- [ ] Many variation options (10+) render correctly
- [ ] Negative price modifiers work
- [ ] All options unavailable disables Buy button

## Rollback Procedure

If issues occur, rollback in reverse order:

### Step 1: Revert Code Changes
```bash
# Checkout previous commit
git checkout HEAD~1

# Restart services
docker-compose restart api worker frontend
```

### Step 2: Rollback Database Migration
```bash
# Connect to database
docker-compose exec postgres psql -U postgres -d ucpready

# Run rollback SQL
ALTER TABLE products
    DROP COLUMN IF EXISTS description_short,
    DROP COLUMN IF EXISTS description_long,
    DROP COLUMN IF EXISTS variations,
    DROP COLUMN IF EXISTS has_variations;

DROP INDEX IF EXISTS idx_products_has_variations;
DROP INDEX IF EXISTS idx_products_variations_gin;

-- Recreate original search index
DROP INDEX IF EXISTS idx_products_search;
CREATE INDEX idx_products_search ON products USING GIN (
    to_tsvector('english', COALESCE(name, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(category, '') || ' ' ||
    COALESCE(brand, ''))
);
```

### Step 3: Restore Backup (if needed)
```bash
# Full database restore
docker-compose exec -T postgres psql -U postgres ucpready < backup_pre_variations.sql
```

## Performance Impact

**Expected changes:**
- Database: +4 columns per product row (~500 bytes with variations)
- Search query: +2 fields in full-text search (minimal impact)
- API response: +200-500 bytes per product with variations
- Frontend render: +50ms per product card with variations

**Optimizations in place:**
- Partial index on `has_variations` (only TRUE values)
- GIN index on `variations` JSONB
- Variation UI only renders when `has_variations = true`

## Monitoring

**Key metrics to watch:**
- Search query performance (should remain <100ms)
- Product indexing job duration (should remain <10min per merchant)
- Frontend load time (should remain <2s)
- Checkout success rate (should remain >95%)

**Error logging:**
- Watch for `VARIATION_*` error codes in checkout API
- Monitor product indexing failures for variation parsing errors
- Check browser console for JavaScript errors on product cards

## Support

**Common Issues:**

1. **Migration fails on existing data**
   - Check for NULL values in description field
   - Verify PostgreSQL version supports JSONB (9.4+)

2. **Variations not displaying**
   - Verify `has_variations` flag set correctly
   - Check JSONB structure matches spec
   - Ensure frontend JavaScript loaded

3. **Price calculation wrong**
   - Check `price_modifier_cents` values in database
   - Verify server-side calculation in checkout API
   - Ensure frontend uses integer cents, not float dollars

4. **Checkout fails with variations**
   - Verify all required variation attributes selected
   - Check variation availability flags
   - Ensure JSON serialization in request body

## Next Steps

After successful deployment:

1. **Monitor for 24 hours**
   - Check error logs
   - Verify merchant product indexing
   - Watch checkout success rates

2. **Enable for merchants**
   - Update merchant documentation
   - Provide variation JSON format examples
   - Test with pilot merchants first

3. **Future enhancements** (not in this release)
   - Variation images
   - Size charts
   - Variation filtering in search
   - Multi-product cart

## Success Criteria

✅ **Implementation is complete when:**
- Database migration runs successfully
- All existing tests pass (10/10)
- Products without variations work as before
- Products with variations display correctly
- Variation selection updates price
- Checkout validates and accepts variations
- No console errors
- UCP compliance maintained

---

**Deployed by:** Claude Code Implementation Agent
**Date:** 2026-02-11
**Version:** 1.0.0
