require('dotenv').config({ path: '../.env' });
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const PORT = process.env.MCP_PORT || 8080;
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://api:3000';

// Database pool
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000
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

// Tool: search_products
mcpServer.setRequestHandler('tools/list', async () => {
    return {
        tools: [
            {
                name: 'search_products',
                description: 'Search for products across active merchants',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tenant_domain: {
                            type: 'string',
                            description: 'Tenant domain (e.g., shop.ai)'
                        },
                        query: {
                            type: 'string',
                            description: 'Search query'
                        },
                        category: {
                            type: 'string',
                            description: 'Product category filter (optional)'
                        },
                        brand: {
                            type: 'string',
                            description: 'Brand filter (optional)'
                        },
                        max_price_cents: {
                            type: 'integer',
                            description: 'Maximum price in cents (optional)'
                        },
                        currency: {
                            type: 'string',
                            description: 'Currency code (default: EUR)'
                        }
                    },
                    required: ['tenant_domain', 'query']
                }
            },
            {
                name: 'get_product_details',
                description: 'Get detailed information about a specific product',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tenant_domain: {
                            type: 'string',
                            description: 'Tenant domain'
                        },
                        merchant_id: {
                            type: 'string',
                            description: 'Merchant UUID'
                        },
                        product_id: {
                            type: 'string',
                            description: 'Product UUID'
                        }
                    },
                    required: ['tenant_domain', 'merchant_id', 'product_id']
                }
            },
            {
                name: 'create_checkout_session',
                description: 'Create a checkout session for a product',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tenant_domain: {
                            type: 'string',
                            description: 'Tenant domain'
                        },
                        merchant_id: {
                            type: 'string',
                            description: 'Merchant UUID'
                        },
                        product_id: {
                            type: 'string',
                            description: 'Product UUID'
                        },
                        quantity: {
                            type: 'integer',
                            description: 'Quantity (default: 1)'
                        }
                    },
                    required: ['tenant_domain', 'merchant_id', 'product_id']
                }
            }
        ]
    };
});

// Tool execution handler
mcpServer.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'search_products':
                return await handleSearchProducts(args);

            case 'get_product_details':
                return await handleGetProductDetails(args);

            case 'create_checkout_session':
                return await handleCreateCheckoutSession(args);

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
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

// Handle: search_products
async function handleSearchProducts(args) {
    const { tenant_domain, query, category, brand, max_price_cents, currency = 'EUR' } = args;

    // Get tenant
    const tenantResult = await db.query('SELECT * FROM tenants WHERE domain = $1', [tenant_domain]);
    if (tenantResult.rows.length === 0) {
        throw new Error('Tenant not found');
    }

    const tenant = tenantResult.rows[0];

    // Check merchant registry
    const tenantRegistry = merchantRegistry[tenant.id];
    if (!tenantRegistry || tenantRegistry.merchants.length === 0) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ products: [], message: 'No active merchants available' }, null, 2)
                }
            ]
        };
    }

    // Search products
    let searchQuery = `
        SELECT p.id, p.name, p.price_cents, p.currency, p.image_url, p.stock_status,
               p.merchant_id, m.domain as merchant_domain
        FROM products p
        JOIN merchants m ON p.merchant_id = m.id
        WHERE p.tenant_id = $1
          AND p.merchant_id = ANY($2::uuid[])
          AND to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')) @@ plainto_tsquery('english', $3)
          AND p.stock_status = 'in_stock'
    `;

    const queryParams = [tenant.id, tenantRegistry.merchants.map(m => m.id), query];
    let paramIndex = 4;

    if (category) {
        searchQuery += ` AND p.category ILIKE $${paramIndex}`;
        queryParams.push(`%${category}%`);
        paramIndex++;
    }

    if (brand) {
        searchQuery += ` AND p.brand ILIKE $${paramIndex}`;
        queryParams.push(`%${brand}%`);
        paramIndex++;
    }

    if (max_price_cents) {
        searchQuery += ` AND p.price_cents <= $${paramIndex}`;
        queryParams.push(max_price_cents);
        paramIndex++;
    }

    searchQuery += ` LIMIT 20`;

    const result = await db.query(searchQuery, queryParams);

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    products: result.rows.map(p => ({
                        id: p.id,
                        merchant_id: p.merchant_id,
                        merchant_domain: p.merchant_domain,
                        name: p.name,
                        price_cents: p.price_cents,
                        currency: p.currency,
                        image_url: p.image_url,
                        stock_status: p.stock_status
                    })),
                    count: result.rows.length
                }, null, 2)
            }
        ]
    };
}

// Handle: get_product_details
async function handleGetProductDetails(args) {
    const { tenant_domain, merchant_id, product_id } = args;

    const result = await db.query(`
        SELECT p.*, m.domain as merchant_domain, m.status as merchant_status
        FROM products p
        JOIN merchants m ON p.merchant_id = m.id
        JOIN tenants t ON m.tenant_id = t.id
        WHERE t.domain = $1 AND m.id = $2 AND p.id = $3
    `, [tenant_domain, merchant_id, product_id]);

    if (result.rows.length === 0) {
        throw new Error('Product not found');
    }

    const product = result.rows[0];

    // Check merchant status
    if (product.merchant_status !== 'active') {
        throw new Error('Merchant not available');
    }

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    product: {
                        id: product.id,
                        name: product.name,
                        description: product.description,
                        price_cents: product.price_cents,
                        currency: product.currency,
                        image_url: product.image_url,
                        stock_status: product.stock_status,
                        category: product.category,
                        brand: product.brand,
                        merchant: {
                            id: product.merchant_id,
                            domain: product.merchant_domain
                        }
                    }
                }, null, 2)
            }
        ]
    };
}

// Handle: create_checkout_session
async function handleCreateCheckoutSession(args) {
    const { tenant_domain, merchant_id, product_id, quantity = 1 } = args;

    // Verify merchant is active
    const merchantResult = await db.query(`
        SELECT m.*, mb.status as billing_status, t.id as tenant_id
        FROM merchants m
        LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
        JOIN tenants t ON m.tenant_id = t.id
        WHERE t.domain = $1 AND m.id = $2
    `, [tenant_domain, merchant_id]);

    if (merchantResult.rows.length === 0) {
        throw new Error('Merchant not found');
    }

    const merchant = merchantResult.rows[0];

    if (merchant.status !== 'active') {
        throw new Error('Merchant not available');
    }

    if (merchant.billing_status === 'suspended' && !merchant.admin_override) {
        throw new Error('Merchant temporarily unavailable');
    }

    // Get product
    const productResult = await db.query(
        'SELECT * FROM products WHERE id = $1 AND merchant_id = $2',
        [product_id, merchant_id]
    );

    if (productResult.rows.length === 0) {
        throw new Error('Product not found');
    }

    const product = productResult.rows[0];

    if (product.stock_status !== 'in_stock') {
        throw new Error('Product out of stock');
    }

    // For MCP, we return the checkout URL that would be generated by the API
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    message: 'Use the public API /api/checkout endpoint to create checkout session',
                    product: {
                        id: product.id,
                        name: product.name,
                        price_cents: product.price_cents,
                        currency: product.currency
                    },
                    merchant: {
                        id: merchant.id,
                        domain: merchant.domain
                    }
                }, null, 2)
            }
        ]
    };
}

// Start MCP stdio transport for AI agents
const transport = new StdioServerTransport();
mcpServer.connect(transport).catch(error => {
    console.error('MCP server connection failed:', error);
    process.exit(1);
});

console.log('MCP server started (stdio transport)');
