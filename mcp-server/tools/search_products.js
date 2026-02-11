module.exports = {
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
    },

    async execute(args, db, merchantRegistry) {
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
};
