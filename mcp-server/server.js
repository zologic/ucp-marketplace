require('dotenv').config({ path: '../.env' });
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
    ListToolsRequestSchema,
    CallToolRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const redis = require('redis');

// Import tools
const searchProductsTool = require('./tools/search_products.js');
const createCheckoutTool = require('./tools/create_checkout.js');
const getMerchantInfoTool = require('./tools/get_merchant_info.js');
const getRecommendationsTool = require('./tools/get_recommendations.js');
const manageCartTool = require('./tools/manage_cart.js');

// Import enforcement functions
const { isMerchantEligible } = require('./enforcement/payment_check.js');
const { checkTrustScore } = require('./enforcement/trust_check.js');

const PORT = process.env.MCP_PORT || 8080;
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://api:3000';

// Database pool
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000
});

// Redis client for cart management
const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

redisClient.on('connect', () => {
    console.log('Redis connected');
});

// Connect to Redis
redisClient.connect().catch(err => {
    console.error('Redis connection failed:', err);
});

// In-memory merchant registry cache
let merchantRegistry = {};
let lastRefresh = null;

// HTTP server for internal endpoints
const app = express();
app.use(express.json());

// POST /internal/reload - Hot reload merchant registry
app.post('/internal/reload', async (req, res) => {
    try {
        await refreshMerchantRegistry();
        res.json({
            status: 'reloaded',
            merchant_count: Object.keys(merchantRegistry).length,
            reloaded_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Reload failed:', error);
        res.status(500).json({ error: 'Reload failed' });
    }
});

// GET /internal/health - Health check
app.get('/internal/health', (req, res) => {
    res.json({
        status: 'ok',
        merchant_count: Object.keys(merchantRegistry).length,
        last_refresh: lastRefresh
    });
});

// Start HTTP server
app.listen(PORT, () => {
    console.log(`MCP server HTTP endpoint listening on port ${PORT}`);
    refreshMerchantRegistry().catch(err => {
        console.error('Initial merchant registry load failed:', err);
    });
});

// Refresh merchant registry periodically
setInterval(() => {
    refreshMerchantRegistry().catch(err => {
        console.error('Periodic refresh failed:', err);
    });
}, 5 * 60 * 1000); // Every 5 minutes

// Refresh merchant registry from API
async function refreshMerchantRegistry() {
    try {
        // Get all active tenants
        const tenantsResult = await db.query('SELECT id, domain FROM tenants WHERE status = $1', ['active']);

        const newRegistry = {};

        for (const tenant of tenantsResult.rows) {
            try {
                const response = await axios.get(`${API_INTERNAL_URL}/internal/active-merchants`, {
                    params: { tenant_id: tenant.id },
                    timeout: 5000
                });

                newRegistry[tenant.id] = {
                    tenant_domain: tenant.domain,
                    merchants: response.data.merchants
                };
            } catch (error) {
                console.error(`Failed to load merchants for tenant ${tenant.id}:`, error.message);
                // Keep existing data if refresh fails
                if (merchantRegistry[tenant.id]) {
                    newRegistry[tenant.id] = merchantRegistry[tenant.id];
                }
            }
        }

        merchantRegistry = newRegistry;
        lastRefresh = new Date().toISOString();
        console.log(`Merchant registry refreshed: ${Object.keys(merchantRegistry).length} tenants loaded`);
    } catch (error) {
        console.error('Failed to refresh merchant registry:', error);
        throw error;
    }
}

// MCP Server for stdio transport
const mcpServer = new Server(
    {
        name: 'ucpready-commerce',
        version: '1.0.0'
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

// Tool registration - load from tools directory
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: searchProductsTool.name,
                description: searchProductsTool.description,
                inputSchema: searchProductsTool.inputSchema
            },
            {
                name: getMerchantInfoTool.name,
                description: getMerchantInfoTool.description,
                inputSchema: getMerchantInfoTool.inputSchema
            },
            {
                name: createCheckoutTool.name,
                description: createCheckoutTool.description,
                inputSchema: createCheckoutTool.inputSchema
            },
            {
                name: getRecommendationsTool.name,
                description: getRecommendationsTool.description,
                inputSchema: getRecommendationsTool.inputSchema
            },
            {
                name: manageCartTool.name,
                description: manageCartTool.description,
                inputSchema: manageCartTool.inputSchema
            }
        ]
    };
});

// Tool execution handler - delegate to tool modules
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        let result;

        switch (name) {
            case 'search_products':
                result = await searchProductsTool.execute(args, db, merchantRegistry);
                break;

            case 'get_product_details':
                result = await getMerchantInfoTool.execute(args, db);
                break;

            case 'create_checkout_session':
                // Apply enforcement checks
                const eligibility = await isMerchantEligible(args.merchant_id, db);
                if (!eligibility.eligible) {
                    throw new Error(`Merchant not eligible: ${eligibility.reason}`);
                }

                const trustCheck = await checkTrustScore(args.merchant_id, db);
                if (trustCheck.status === 'low') {
                    console.warn(`Warning: Merchant ${args.merchant_id} has low trust score: ${trustCheck.score}`);
                }

                result = await createCheckoutTool.execute(args, db);
                break;

            case 'get_recommendations':
                result = await getRecommendationsTool.execute(args, { db, merchantRegistry });
                break;

            case 'manage_cart':
                result = await manageCartTool.execute(args, { db, redis: redisClient });
                break;

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        return result;
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error.message}`
                }
            ],
            isError: true
        };
    }
});


// Start MCP stdio transport for AI agents
const transport = new StdioServerTransport();
mcpServer.connect(transport).catch(error => {
    console.error('MCP server connection failed:', error);
    process.exit(1);
});

console.log('MCP server started (stdio transport)');
