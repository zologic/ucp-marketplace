#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ucpready';
const MIGRATIONS_DIR = path.join('/database', 'migrations');

async function runMigrations() {
    const client = new Client({ connectionString: DATABASE_URL });

    try {
        await client.connect();
        console.log('Connected to database');

        // Ensure schema_migrations table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                migration_file TEXT UNIQUE NOT NULL,
                applied_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

        // Get list of already applied migrations
        const { rows: appliedMigrations } = await client.query(
            'SELECT migration_file FROM schema_migrations ORDER BY migration_file'
        );
        const appliedSet = new Set(appliedMigrations.map(r => r.migration_file));

        // Get list of all migration files
        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.sql'))
            .filter(f => !f.includes('.down.'))  // Exclude down migrations
            .sort();

        console.log(`Found ${files.length} migration files`);
        console.log(`Already applied: ${appliedSet.size} migrations`);

        // Run pending migrations
        let appliedCount = 0;
        for (const file of files) {
            if (appliedSet.has(file)) {
                console.log(`[SKIP] ${file} (already applied)`);
                continue;
            }

            console.log(`[RUN] ${file}`);
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations (migration_file) VALUES ($1)',
                    [file]
                );
                await client.query('COMMIT');
                console.log(`[OK] ${file}`);
                appliedCount++;
            } catch (error) {
                await client.query('ROLLBACK');
                console.error(`[FAIL] ${file}:`, error.message);
                throw error;
            }
        }

        console.log(`\nMigration complete: ${appliedCount} new migrations applied`);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Run if executed directly
if (require.main === module) {
    runMigrations().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runMigrations };
