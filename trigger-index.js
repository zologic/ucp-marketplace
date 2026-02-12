#!/usr/bin/env node
/**
 * Manual trigger for product indexing job
 * Usage: node trigger-index.js
 * Or via Docker: docker compose exec worker node /app/trigger-index.js
 */

require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');
const { indexProducts } = require('./worker/jobs/indexProducts');

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000
});

console.log('Manually triggering product indexing job...');

indexProducts(db)
    .then(result => {
        console.log('Product indexing completed successfully:', result);
        return db.end();
    })
    .then(() => {
        console.log('Database connection closed');
        process.exit(0);
    })
    .catch(err => {
        console.error('Product indexing failed:', err);
        return db.end().then(() => process.exit(1));
    });
