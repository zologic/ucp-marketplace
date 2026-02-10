require('dotenv').config({ path: '../.env' });
const cron = require('node-cron');
const { Pool } = require('pg');

// Import job modules
const { verifyMerchants } = require('./jobs/verifyMerchants');
const { indexProducts } = require('./jobs/indexProducts');
const { rollupStats } = require('./jobs/rollupStats');
const { generateInvoices } = require('./jobs/generateInvoices');
const { generateStatements } = require('./jobs/generateStatements');
const { enforceNonPayment } = require('./jobs/enforceNonPayment');

// Database pool
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000
});

console.log('Worker service starting...');

// Test database connection
db.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('Database connected at:', res.rows[0].now);
});

// Schedule jobs

// Merchant UCP verification - Daily at 02:00 UTC
cron.schedule('0 2 * * *', () => {
    console.log('Running merchant verification job...');
    verifyMerchants(db).catch(err => console.error('Merchant verification failed:', err));
}, {
    timezone: 'UTC'
});

// Product index refresh - Every 6 hours
cron.schedule('0 */6 * * *', () => {
    console.log('Running product indexing job...');
    indexProducts(db).catch(err => console.error('Product indexing failed:', err));
}, {
    timezone: 'UTC'
});

// Daily stats rollup - Daily at 00:30 UTC
cron.schedule('30 0 * * *', () => {
    console.log('Running daily stats rollup job...');
    rollupStats(db).catch(err => console.error('Stats rollup failed:', err));
}, {
    timezone: 'UTC'
});

// Invoice generation - Monthly on 1st at 00:00 UTC
cron.schedule('0 0 1 * *', () => {
    console.log('Running invoice generation job...');
    generateInvoices(db).catch(err => console.error('Invoice generation failed:', err));
}, {
    timezone: 'UTC'
});

// Tenant statement generation - Monthly on 1st at 01:00 UTC
cron.schedule('0 1 1 * *', () => {
    console.log('Running tenant statement generation job...');
    generateStatements(db).catch(err => console.error('Statement generation failed:', err));
}, {
    timezone: 'UTC'
});

// Non-payment enforcement - Daily at 06:00 UTC
cron.schedule('0 6 * * *', () => {
    console.log('Running non-payment enforcement job...');
    enforceNonPayment(db).catch(err => console.error('Non-payment enforcement failed:', err));
}, {
    timezone: 'UTC'
});

console.log('Worker service started. Scheduled jobs:');
console.log('- Merchant verification: Daily at 02:00 UTC');
console.log('- Product indexing: Every 6 hours');
console.log('- Stats rollup: Daily at 00:30 UTC');
console.log('- Invoice generation: Monthly on 1st at 00:00 UTC');
console.log('- Statement generation: Monthly on 1st at 01:00 UTC');
console.log('- Non-payment enforcement: Daily at 06:00 UTC');

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await db.end();
    process.exit(0);
});

// Keep process alive
process.stdin.resume();
