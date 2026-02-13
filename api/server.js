require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { createClient } = require('redis');

// Import routes
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const adminExtendedRoutes = require('./routes/admin-extended');
const webhookRoutes = require('./routes/webhooks');
const internalRoutes = require('./routes/internal');
const seoRoutes = require('./routes/seo');
const billingRoutes = require('./routes/billing');
const stripeWebhookRoutes = require('./routes/stripe-webhooks');

// Import middleware
const { resolveTenant } = require('./middleware/tenant');
const { errorHandler } = require('./middleware/errorHandler');

// GraphQL
const { graphqlHTTP } = require('express-graphql');
const schema = require('./graphql/schema');
const { resolvers, nestedResolvers } = require('./graphql/resolvers');

const app = express();
const PORT = process.env.API_PORT || 3000;

// Database pool
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Redis client
const redis = createClient({
    url: process.env.REDIS_URL
});

redis.on('error', (err) => console.error('Redis Client Error', err));
redis.on('connect', () => console.log('Redis connected'));

// Initialize Redis connection
(async () => {
    try {
        await redis.connect();
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
    }
})();

// Make db and redis available to routes
app.locals.db = db;
app.locals.redis = redis;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: 'Too many requests, please try again later'
});
app.use(limiter);

// Stripe webhook route MUST be registered BEFORE body parsing middleware
// Stripe requires raw body for signature verification
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check (no tenant resolution)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SEO routes (tenant-aware, served at root level)
app.use('/', resolveTenant, seoRoutes);

// Public API routes (tenant-aware)
app.use('/api', resolveTenant, publicRoutes);

// Billing routes (merchant payment management)
app.use('/api/billing', resolveTenant, billingRoutes);

// Admin routes (no tenant resolution, JWT auth)
app.use('/admin', adminRoutes);
app.use('/admin', adminExtendedRoutes);

// Webhook routes (signature verification)
app.use('/api/webhooks', resolveTenant, webhookRoutes);

// Internal routes (service-to-service, no public exposure)
app.use('/internal', internalRoutes);

// GraphQL API (optional, enabled by default in development)
const graphqlEnabled = process.env.GRAPHQL_ENABLED !== 'false';
if (graphqlEnabled) {
    app.use('/graphql', graphqlHTTP((req) => ({
        schema: schema,
        rootValue: resolvers,
        graphiql: process.env.NODE_ENV !== 'production',
        context: { db: req.app.locals.db, redis: req.app.locals.redis },
        fieldResolver: (source, args, context, info) => {
            // Custom field resolver for nested data
            if (nestedResolvers[info.parentType.name] && nestedResolvers[info.parentType.name][info.fieldName]) {
                return nestedResolvers[info.parentType.name][info.fieldName](source, args, context, info);
            }
            // Default resolver
            return source[info.fieldName];
        }
    })));
    console.log(`GraphQL endpoint enabled at /graphql (GraphiQL: ${process.env.NODE_ENV !== 'production'})`);
}

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await db.end();
    await redis.quit();
    process.exit(0);
});

// Global worker status tracking
global.workerStatus = {
    running: false,
    startedAt: null,
    error: null
};

// Start server
app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Start background worker if RUN_WORKER env is set
if (process.env.RUN_WORKER === 'true') {
    console.log('Starting background worker...');
    try {
        require('./worker/index.js');
        global.workerStatus.running = true;
        global.workerStatus.startedAt = new Date();
        console.log('Background worker started successfully');
    } catch (err) {
        console.error('Failed to start background worker:', err);
        global.workerStatus.error = err.message;
    }
}

module.exports = app;
