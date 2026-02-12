/**
 * MCP Tool: Get Product Recommendations
 * AI-powered product recommendations using hybrid approach
 */

module.exports = {
    name: 'get_recommendations',
    description: 'Get AI-powered product recommendations based on context (product, category, search history)',
    inputSchema: {
        type: 'object',
        properties: {
            tenant_domain: {
                type: 'string',
                description: 'Tenant domain (e.g., search.example.com)'
            },
            context: {
                type: 'object',
                description: 'Recommendation context',
                properties: {
                    product_id: {
                        type: 'string',
                        description: 'Product ID for similar product recommendations'
                    },
                    category: {
                        type: 'string',
                        description: 'Category for category-based recommendations'
                    },
                    search_query: {
                        type: 'string',
                        description: 'Search query for query-based recommendations'
                    },
                    session_id: {
                        type: 'string',
                        description: 'Session ID for personalized recommendations'
                    }
                }
            },
            limit: {
                type: 'number',
                description: 'Maximum number of recommendations to return (default: 10)',
                default: 10
            }
        },
        required: ['tenant_domain', 'context']
    },

    async execute({ tenant_domain, context, limit = 10 }, { db, merchantRegistry }) {
        try {
            // Get tenant
            const tenantResult = await db.query(
                'SELECT id FROM tenants WHERE domain = $1',
                [tenant_domain]
            );

            if (tenantResult.rows.length === 0) {
                return {
                    error: 'Tenant not found',
                    recommendations: []
                };
            }

            const tenantId = tenantResult.rows[0].id;
            let baseProduct = null;
            let recommendations = [];

            // If product_id is provided, get product details for content-based filtering
            if (context.product_id) {
                const productResult = await db.query(
                    'SELECT * FROM products WHERE id = $1',
                    [context.product_id]
                );

                if (productResult.rows.length === 0) {
                    return {
                        error: 'Product not found',
                        recommendations: []
                    };
                }

                baseProduct = productResult.rows[0];
            }

            // Build recommendation query with hybrid approach
            let recommendationQuery = `
                SELECT DISTINCT
                    p.id,
                    p.name,
                    p.description,
                    p.price_cents,
                    p.currency,
                    p.image_url,
                    p.category,
                    p.brand,
                    p.stock_status,
                    p.merchant_id,
                    m.domain as merchant_domain,
                    m.business_name as merchant_name,
                    (
                        -- Content-based score (60% weight)
                        (CASE WHEN p.category = $2 THEN 30 ELSE 0 END) +
                        (CASE WHEN p.brand = $3 THEN 20 ELSE 0 END) +
                        (CASE WHEN ABS(p.price_cents - $4) < ($4 * 0.2) THEN 10 ELSE 0 END) +

                        -- Behavioral score (40% weight)
                        (SELECT COUNT(*) * 5 FROM click_events ce
                         WHERE ce.product_id = p.id
                         AND ce.occurred_at > NOW() - INTERVAL '30 days') +
                        (SELECT COUNT(*) * 10 FROM search_events se
                         WHERE se.results::jsonb @> jsonb_build_array(jsonb_build_object('id', p.id))
                         AND se.occurred_at > NOW() - INTERVAL '30 days')
                    ) as relevance_score
                FROM products p
                JOIN merchants m ON p.merchant_id = m.id
                JOIN merchant_billing mb ON m.id = mb.merchant_id
                WHERE p.tenant_id = $1
                  AND p.stock_status != 'out_of_stock'
                  AND p.id != $5
                  AND m.status = 'active'
                  AND mb.status = 'active'
            `;

            const queryParams = [
                tenantId,
                baseProduct ? baseProduct.category : context.category || '',
                baseProduct ? baseProduct.brand : '',
                baseProduct ? baseProduct.price_cents : 0,
                context.product_id || '00000000-0000-0000-0000-000000000000'
            ];

            // Add session-based personalization if session_id provided
            if (context.session_id) {
                recommendationQuery += `
                    AND (
                        -- Prefer products user has clicked
                        EXISTS (
                            SELECT 1 FROM click_events ce
                            WHERE ce.product_id = p.id
                            AND ce.session_id = $6
                        )
                        OR
                        -- Or products in similar categories user has searched
                        p.category IN (
                            SELECT DISTINCT unnest(string_to_array(se.query, ' ')) as cat
                            FROM search_events se
                            WHERE se.session_id = $6
                            AND se.occurred_at > NOW() - INTERVAL '7 days'
                        )
                        OR
                        -- Or just general popular products
                        1=1
                    )
                `;
                queryParams.push(context.session_id);
            }

            // Add search query filtering if provided
            if (context.search_query) {
                recommendationQuery += `
                    AND (
                        to_tsvector('english', p.name || ' ' || COALESCE(p.description, '')) @@ plainto_tsquery('english', $${queryParams.length + 1})
                        OR LOWER(p.name) LIKE $${queryParams.length + 2}
                        OR LOWER(p.category) LIKE $${queryParams.length + 2}
                    )
                `;
                queryParams.push(context.search_query);
                queryParams.push(`%${context.search_query.toLowerCase()}%`);
            }

            recommendationQuery += `
                ORDER BY relevance_score DESC, p.created_at DESC
                LIMIT $${queryParams.length + 1}
            `;
            queryParams.push(limit);

            const result = await db.query(recommendationQuery, queryParams);
            recommendations = result.rows;

            // If no recommendations found and we have behavioral data, fall back to content-based only
            if (recommendations.length === 0 && baseProduct) {
                const fallbackResult = await db.query(`
                    SELECT
                        p.id,
                        p.name,
                        p.description,
                        p.price_cents,
                        p.currency,
                        p.image_url,
                        p.category,
                        p.brand,
                        p.stock_status,
                        p.merchant_id,
                        m.domain as merchant_domain,
                        m.business_name as merchant_name
                    FROM products p
                    JOIN merchants m ON p.merchant_id = m.id
                    JOIN merchant_billing mb ON m.id = mb.merchant_id
                    WHERE p.tenant_id = $1
                      AND p.category = $2
                      AND p.id != $3
                      AND p.stock_status != 'out_of_stock'
                      AND m.status = 'active'
                      AND mb.status = 'active'
                    ORDER BY p.created_at DESC
                    LIMIT $4
                `, [tenantId, baseProduct.category, context.product_id, limit]);

                recommendations = fallbackResult.rows;
            }

            // Check if tenant has any active merchants
            if (recommendations.length === 0) {
                const activeMerchantsResult = await db.query(`
                    SELECT COUNT(*) as count
                    FROM merchants m
                    JOIN merchant_billing mb ON m.id = mb.merchant_id
                    WHERE m.tenant_id = $1
                      AND m.status = 'active'
                      AND mb.status = 'active'
                `, [tenantId]);

                if (activeMerchantsResult.rows[0].count === 0) {
                    return {
                        recommendations: [],
                        message: 'No active merchants available for this tenant'
                    };
                }
            }

            return {
                recommendations: recommendations.map(p => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    price: {
                        amount: p.price_cents,
                        currency: p.currency,
                        formatted: `${(p.price_cents / 100).toFixed(2)} ${p.currency}`
                    },
                    image_url: p.image_url,
                    category: p.category,
                    brand: p.brand,
                    stock_status: p.stock_status,
                    merchant: {
                        id: p.merchant_id,
                        domain: p.merchant_domain,
                        name: p.merchant_name
                    }
                })),
                count: recommendations.length,
                context: {
                    based_on: context.product_id ? 'product' : context.category ? 'category' : context.search_query ? 'search' : 'general',
                    personalized: !!context.session_id
                }
            };

        } catch (error) {
            console.error('[get_recommendations] Error:', error);
            return {
                error: 'Failed to generate recommendations',
                details: error.message,
                recommendations: []
            };
        }
    }
};
