/**
 * Database Initialization Script
 *
 * Initializes fresh PostgreSQL database from master schema.sql
 * Replaces the old sequential migration system for new installations.
 *
 * Usage: node database/init-db.js
 * Environment: Requires DATABASE_URL environment variable
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function initDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('[init-db] Checking database state...');

    // Check if database already initialized (look for tenants table)
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'tenants'
      );
    `);

    if (checkResult.rows[0].exists) {
      console.log('[init-db] Database already initialized. Skipping schema creation.');
      console.log('[init-db] If you need to recreate the schema, drop all tables first.');
      await pool.end();
      return;
    }

    console.log('[init-db] Fresh database detected. Applying master schema...');

    // Read schema.sql (check both current dir and /database for Docker compatibility)
    let schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      schemaPath = '/database/schema.sql';
    }

    if (!fs.existsSync(schemaPath)) {
      console.error('[init-db] ERROR: schema.sql not found at:', schemaPath);
      console.error('[init-db] Please ensure database/schema.sql exists.');
      process.exit(1);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('[init-db] Executing master schema SQL...');

    // Execute schema (this includes all CREATE TABLE, CREATE INDEX, CREATE TRIGGER statements)
    await pool.query(schema);

    console.log('[init-db] ✓ Master schema applied successfully');
    console.log('[init-db] ✓ All tables, indexes, and triggers created');
    console.log('[init-db] Database is ready for use');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('[init-db] ✗ Failed to initialize database:', error.message);
    console.error('[init-db] Error details:', error);

    // Attempt to close pool
    try {
      await pool.end();
    } catch (poolError) {
      // Ignore pool close errors
    }

    process.exit(1);
  }
}

// Run initialization
initDatabase();
