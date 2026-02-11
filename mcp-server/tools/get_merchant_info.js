module.exports = {
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
    },

    async execute(args, db) {
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
};
