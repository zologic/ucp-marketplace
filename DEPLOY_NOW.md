# Quick Deployment Fix

You're almost there! Here's how to complete the deployment:

## Issue 1: TTY Error ✅ FIXED

**Error:** `the input device is not a TTY`

**Solution:** Use `-T` flag with docker compose exec:

```bash
# Instead of:
docker compose exec postgres psql -U postgres -d ucpready < database/migrations/002_add_product_variations.sql

# Use:
cat database/migrations/002_add_product_variations.sql | docker compose exec -T postgres psql -U postgres -d ucpready
```

## Issue 2: Worker Service Not Found

**Error:** `no such service: worker`

**Your docker-compose.yml doesn't have a "worker" service.** Let's check what services you have:

```bash
docker compose config --services
```

**Restart only the services that exist:**

```bash
# Restart API and frontend only
docker compose restart api frontend

# Or restart everything except worker
docker compose restart api frontend caddy postgres redis
```

## Automated Deployment Script

I've created a script that handles all of this:

```bash
# Run the automated deployment
./deploy-migration.sh
```

This script:
1. ✅ Verifies your backup exists
2. ✅ Applies migration with correct -T flag
3. ✅ Verifies all columns and indexes created
4. ✅ Restarts only the services that exist
5. ✅ Tests API endpoint

## Manual Steps (if you prefer)

### 1. Apply Migration (FIXED command)

```bash
cat database/migrations/002_add_product_variations.sql | docker compose exec -T postgres psql -U postgres -d ucpready
```

### 2. Verify Migration

```bash
# Check columns added
docker compose exec -T postgres psql -U postgres -d ucpready -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'products'
  AND column_name IN ('description_short', 'description_long', 'variations', 'has_variations', 'search_vector')
  ORDER BY column_name;
"
```

**Expected output:**
```
     column_name     |   data_type
---------------------+---------------
 description_long    | text
 description_short   | text
 has_variations      | boolean
 search_vector       | tsvector
 variations          | jsonb
(5 rows)
```

### 3. Check Indexes

```bash
docker compose exec -T postgres psql -U postgres -d ucpready -c "
  SELECT indexname
  FROM pg_indexes
  WHERE tablename = 'products'
  AND (indexname LIKE '%variation%' OR indexname LIKE '%search_vector%')
  ORDER BY indexname;
"
```

**Expected output:**
```
          indexname
-----------------------------
 idx_products_has_variations
 idx_products_variations_gin
 idx_products_search_vector
(3 rows)
```

### 4. Restart Services

```bash
# Find what services you have
docker compose config --services

# Restart API and frontend (the main services)
docker compose restart api frontend

# If you have other services, restart them too
docker compose restart caddy  # If you use Caddy
```

### 5. Verify API Works

```bash
# Test search endpoint
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}' | jq '.results[0] | keys'
```

**Expected:** Should include `description_short`, `variations`, `has_variations`

### 6. Test Search Performance

```bash
docker compose exec -T postgres psql -U postgres -d ucpready -c "
  EXPLAIN ANALYZE
  SELECT id, name
  FROM products
  WHERE search_vector @@ plainto_tsquery('english', 'test')
  LIMIT 20;
"
```

**Expected:** Execution time should be <100ms

## If Migration Already Ran

If the migration already partially applied, you can check:

```bash
# Check if columns exist
docker compose exec -T postgres psql -U postgres -d ucpready -c "\d products" | grep -E "description_short|variations|search_vector"
```

If columns already exist:
- ✅ **Migration is complete!** Just restart services
- ⚠️ If partial: Drop the columns and re-run
- ❌ If broken: Restore from backup

## Rollback (if needed)

```bash
# Restore from backup
cat backup.sql | docker compose exec -T postgres psql -U postgres ucpready
```

## Quick Test After Deployment

```bash
# 1. Check API is up
curl http://localhost:3000/api/search -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'

# 2. Run integration test
./test-variation-to-vault.sh

# 3. Monitor logs
docker compose logs -f api | grep -i "search\|checkout"
```

## Current Status

Based on your terminal output:
- ✅ Backup created successfully
- ⚠️ Migration attempted but TTY error
- ⚠️ Services restart failed (worker doesn't exist)

**Next command to run:**

```bash
# Use the automated script
./deploy-migration.sh

# OR manually with fixed commands
cat database/migrations/002_add_product_variations.sql | docker compose exec -T postgres psql -U postgres -d ucpready
docker compose restart api frontend
```

---

**Need help?** Check logs:
```bash
docker compose logs --tail=50 api
docker compose logs --tail=50 postgres
```
