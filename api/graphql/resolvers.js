/**
 * GraphQL Resolvers
 */

const resolvers = {
    /**
     * Search products with filtering
     */
    async searchProducts(args, context) {
        const { db } = context;
        const {
            tenant_domain,
            query,
            category,
            brand,
            max_price_cents,
            limit = 20,
            offset = 0
        } = args;

        try {
            // Get tenant ID
            const tenantResult = await db.query(
                'SELECT id FROM tenants WHERE domain = $1',
                [tenant_domain]
            );

            if (tenantResult.rows.length === 0) {
                return {
                    products: [],
                    total_count: 0,
                    facets: []
                };
            }

            const tenantId = tenantResult.rows[0].id;

            // Build query
            let searchQuery = `
                SELECT
                    p.id, p.name, p.description, p.price_cents, p.currency,
                    p.image_url, p.stock_status, p.category, p.brand,
                    p.merchant_id, p.created_at,
                    m.domain as merchant_domain,
                    m.business_name as merchant_business_name
                FROM products p
                JOIN merchants m ON p.merchant_id = m.id
                JOIN merchant_billing mb ON m.id = mb.merchant_id
                WHERE p.tenant_id = $1
                  AND m.status = 'active'
                  AND mb.status = 'active'
            `;

            const params = [tenantId];
            let paramIndex = 2;

            // Add full-text search if query provided
            if (query) {
                searchQuery += ` AND (
                    to_tsvector('english', p.name || ' ' || COALESCE(p.description, '')) @@ plainto_tsquery('english', $${paramIndex})
                    OR LOWER(p.name) LIKE $${paramIndex + 1}
                )`;
                params.push(query);
                params.push(`%${query.toLowerCase()}%`);
                paramIndex += 2;
            }

            // Add category filter
            if (category) {
                searchQuery += ` AND p.category = $${paramIndex}`;
                params.push(category);
                paramIndex++;
            }

            // Add brand filter
            if (brand) {
                searchQuery += ` AND p.brand = $${paramIndex}`;
                params.push(brand);
                paramIndex++;
            }

            // Add price filter
            if (max_price_cents) {
                searchQuery += ` AND p.price_cents <= $${paramIndex}`;
                params.push(max_price_cents);
                paramIndex++;
            }

            // Get total count
            const countQuery = searchQuery.replace(
                'SELECT\n                    p.id, p.name, p.description, p.price_cents, p.currency,\n                    p.image_url, p.stock_status, p.category, p.brand,\n                    p.merchant_id, p.created_at,\n                    m.domain as merchant_domain,\n                    m.business_name as merchant_business_name',
                'SELECT COUNT(*) as count'
            );
            const countResult = await db.query(countQuery, params);
            const totalCount = parseInt(countResult.rows[0].count);

            // Add pagination
            searchQuery += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
            params.push(limit);
            params.push(offset);

            // Execute search
            const result = await db.query(searchQuery, params);

            // Get facets (categories with counts)
            const facetsResult = await db.query(`
                SELECT category, COUNT(*) as count
                FROM products p
                JOIN merchants m ON p.merchant_id = m.id
                JOIN merchant_billing mb ON m.id = mb.merchant_id
                WHERE p.tenant_id = $1
                  AND m.status = 'active'
                  AND mb.status = 'active'
                  AND p.category IS NOT NULL
                GROUP BY category
                ORDER BY count DESC
                LIMIT 10
            `, [tenantId]);

            return {
                products: result.rows,
                total_count: totalCount,
                facets: facetsResult.rows
            };

        } catch (error) {
            console.error('[GraphQL] searchProducts error:', error);
            throw error;
        }
    },

    /**
     * Get single product by ID
     */
    async getProduct(args, context) {
        const { db } = context;
        const { id } = args;

        try {
            const result = await db.query(`
                SELECT
                    p.*,
                    m.domain as merchant_domain,
                    m.business_name as merchant_business_name
                FROM products p
                JOIN merchants m ON p.merchant_id = m.id
                WHERE p.id = $1
            `, [id]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];

        } catch (error) {
            console.error('[GraphQL] getProduct error:', error);
            throw error;
        }
    },

    /**
     * Get merchant by ID with products
     */
    async getMerchant(args, context) {
        const { db } = context;
        const { id } = args;

        try {
            const result = await db.query(
                'SELECT * FROM merchants WHERE id = $1',
                [id]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];

        } catch (error) {
            console.error('[GraphQL] getMerchant error:', error);
            throw error;
        }
    },

    /**
     * Get all active tenants
     */
    async getTenants(args, context) {
        const { db } = context;

        try {
            const result = await db.query(
                'SELECT * FROM tenants WHERE status = $1 ORDER BY name',
                ['active']
            );

            return result.rows;

        } catch (error) {
            console.error('[GraphQL] getTenants error:', error);
            throw error;
        }
    }
};

// Nested resolvers for related data
const nestedResolvers = {
    Product: {
        merchant: async (parent, args, context) => {
            const { db } = context;
            const result = await db.query(
                'SELECT * FROM merchants WHERE id = $1',
                [parent.merchant_id]
            );
            return result.rows[0] || null;
        }
    },

    Merchant: {
        products: async (parent, args, context) => {
            const { db } = context;
            const result = await db.query(
                'SELECT * FROM products WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 50',
                [parent.id]
            );
            return result.rows;
        }
    },

    Tenant: {
        merchants: async (parent, args, context) => {
            const { db } = context;
            const result = await db.query(
                'SELECT * FROM merchants WHERE tenant_id = $1 AND status = $2 ORDER BY business_name',
                [parent.id, 'active']
            );
            return result.rows;
        }
    }
};

module.exports = { resolvers, nestedResolvers };
