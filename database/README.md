# Database Migration Strategy

## Overview

The UCP Marketplace uses a unified migration system based on sequential SQL migration files. This document explains how migrations work and how to create new ones.

## Migration System

### Fresh Installations

Fresh installations (empty database) will:
1. Run `000_base_schema.sql` to create the complete initial schema
2. Mark this migration as completed in `schema_migrations` table
3. Run any newer migrations (006+) that exist

### Existing Installations (Upgrades)

Existing installations will:
1. Check which migrations have already been applied (tracked in `schema_migrations`)
2. Run only the pending migrations in sequential order
3. Skip migrations that have already been applied

## Migration Files

### Location

All migrations are in: `/database/migrations/`

### Naming Convention

Migrations follow this pattern: `###_descriptive_name.sql`

Examples:
- `000_base_schema.sql` - Base schema for fresh installs
- `006_add_unique_invoice_constraint.sql` - Add constraint to invoices
- `007_add_worker_locks_table.sql` - Create new table

### Numbering

- **000-005**: Consolidated into base schema (DO NOT EDIT)
- **006+**: New migrations (add here)

## Creating New Migrations

### Step 1: Create Migration File

Create a new file in `/database/migrations/` with the next sequential number:

```bash
# Find the latest migration number
ls -1 database/migrations/*.sql | tail -1

# Create new migration
nano database/migrations/007_your_change.sql
```

### Step 2: Write Migration SQL

Your migration file should:
- Use `IF NOT EXISTS` for CREATE statements
- Use `ADD COLUMN IF NOT EXISTS` for ALTER statements
- Be idempotent (safe to run multiple times)
- Include comments explaining the change

**Example:**

```sql
-- Migration 007: Add unique constraint to invoices
-- Purpose: Prevent duplicate invoice generation
-- Date: 2026-02-13

ALTER TABLE invoices
ADD CONSTRAINT unique_merchant_period
UNIQUE (merchant_id, period_start, period_end);

COMMENT ON CONSTRAINT unique_merchant_period ON invoices IS
'Prevents duplicate invoices for the same merchant and billing period';
```

### Step 3: Test Migration

Test on a development database:

```bash
# Connect to database
docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB

# Manually test your migration SQL
\i /database/migrations/007_your_change.sql

# Verify it worked
\dt
\d your_table
```

### Step 4: Apply Migration

The migration will run automatically on next deployment:
- On container restart, `migrate.js` runs during startup
- It checks `schema_migrations` table for applied migrations
- Runs your new migration if not already applied
- Marks it as complete

## Migration Guidelines

### DO:
- ✅ Use `IF NOT EXISTS` clauses
- ✅ Use transactions (migrate.js handles this)
- ✅ Test on dev/staging first
- ✅ Include comments explaining why
- ✅ Keep migrations small and focused
- ✅ Add new migrations as separate files

### DON'T:
- ❌ Edit existing migrations (especially 000-005)
- ❌ Delete migration files
- ❌ Reorder migration numbers
- ❌ Include data changes in schema migrations
- ❌ Assume database state (check before altering)

## Archived Migrations

The `/database/migrations_archive/` directory contains the original 26 sequential migrations that were consolidated into `000_base_schema.sql`. These are kept for historical reference but are **not executed**.

## Schema Files

### `schema.sql` (Archived)

This file has been **replaced** by `000_base_schema.sql` and is kept only for reference. Do NOT use it for fresh installations.

### `000_base_schema.sql` (Current)

This is the authoritative base schema for fresh installations. It includes:
- All tables from the original schema.sql
- Migrations 001-005 consolidated
- Complete indexes and triggers
- Default tenant seed data

**NEVER edit this file after deployment.** All changes must go in new migration files (006+).

## Troubleshooting

### Migration Failed

If a migration fails:

1. Check the error message in container logs:
   ```bash
   docker compose logs api | grep migration
   ```

2. Migrations run in transactions - a failed migration rolls back automatically

3. Fix the migration file and restart the container

4. If stuck, manually check migration status:
   ```bash
   docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
     "SELECT * FROM schema_migrations ORDER BY applied_at;"
   ```

### Reset Development Database

**WARNING: This destroys all data**

```bash
# Stop containers
docker compose down

# Delete volumes (this deletes all database data)
docker volume rm ucp-marketplace_postgres_data

# Start fresh
docker compose up -d
```

Fresh start will run `000_base_schema.sql` and create a clean database.

### Check Applied Migrations

```bash
docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  "SELECT migration_file, applied_at FROM schema_migrations ORDER BY applied_at;"
```

## Migration Process Flow

```
Container starts
    ↓
api/start.sh executes
    ↓
Run: node migrate.js
    ↓
Check: schema_migrations table exists?
    ↓ NO → Fresh Install          ↓ YES → Existing Install
    ↓                              ↓
Create schema_migrations table    Query applied migrations
    ↓                              ↓
Run 000_base_schema.sql           Get pending migrations
    ↓                              ↓
Mark 000 as completed             Run each pending migration
    ↓                              ↓
Check for migrations 006+         Mark each as completed
    ↓                              ↓
Run any new migrations            ↓
    ↓                              ↓
    └────────── DONE ──────────────┘
```

## Files Overview

```
/database/
├── README.md                    ← YOU ARE HERE
├── schema.sql                   ← ARCHIVED (reference only)
├── init-db.js                   ← ARCHIVED (no longer used)
├── migrations/
│   ├── 000_base_schema.sql     ← Base schema (DO NOT EDIT)
│   ├── 001-005 (archived)      ← Consolidated into 000
│   └── 006+ (future)           ← Add new migrations here
├── migrations_archive/
│   ├── migrate.js              ← Migration runner (copied to API container)
│   └── 001-026 migrations      ← Historical reference
└── seed-test-products.sql      ← Test data (optional)
```

## Questions?

- Migration system: Check `database/migrations_archive/migrate.js`
- Base schema: Check `database/migrations/000_base_schema.sql`
- Startup flow: Check `api/start.sh`

## Version

- Migration System: v2.0 (Unified sequential migrations)
- Base Schema: v1.0.0
- Last Updated: 2026-02-13
