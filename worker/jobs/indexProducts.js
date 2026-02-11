/**
 * Job: Index Products from Merchants
 * Frequency: Every 6 hours
 */

const axios = require('axios');

async function indexProducts(db) {
    const startTime = Date.now();
    console.log('[indexProducts] Starting...');

    try {
        // Get all active merchants
        const result = await db.query(`
            SELECT m.id, m.domain, m.ucp_endpoint, m.service_base_url, m.tenant_id
            FROM merchants m
            WHERE m.status = 'active' AND m.ucp_endpoint IS NOT NULL
            LIMIT 50
        `);

        const merchants = result.rows;
        console.log(`[indexProducts] Found ${merchants.length} active merchants`);

        let totalIndexed = 0;
        let merchantsProcessed = 0;

        for (const merchant of merchants) {
            try {
                // Construct products endpoint from stored base_url
                if (!merchant.service_base_url) {
                    console.warn(`[indexProducts] No service_base_url for ${merchant.domain} - needs re-verification`);
                    continue;
                }

                const productsEndpoint = `${merchant.service_base_url}/products`;

                // Fetch products from merchant
                const productsResponse = await axios.get(productsEndpoint, {
                    timeout: 30000,
                    params: {
                        limit: 1000  // Limit per request
                    }
                });

                const products = productsResponse.data.products || [];

                // Upsert products into database
                for (const product of products) {
                    try {
                        await db.query(`
                            INSERT INTO products (
                                merchant_id, tenant_id, external_id, name, description,
                                price_cents, currency, category, brand, image_url, stock_status, indexed_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                            ON CONFLICT (merchant_id, external_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                description = EXCLUDED.description,
                                price_cents = EXCLUDED.price_cents,
                                currency = EXCLUDED.currency,
                                category = EXCLUDED.category,
                                brand = EXCLUDED.brand,
                                image_url = EXCLUDED.image_url,
                                stock_status = EXCLUDED.stock_status,
                                indexed_at = NOW()
                        `, [
                            merchant.id,
                            merchant.tenant_id,
                            product.id,
                            product.name,
                            product.description || null,
                            product.price_cents,
                            product.currency || 'EUR',
                            product.category || null,
                            product.brand || null,
                            product.image_url || null,
                            product.stock_status || 'in_stock'
                        ]);

                        totalIndexed++;
                    } catch (productError) {
                        console.error(`[indexProducts] Failed to index product ${product.id}:`, productError.message);
                    }
                }

                merchantsProcessed++;
                console.log(`[indexProducts] ✓ ${merchant.domain}: ${products.length} products`);

                // Mark old products as out of stock (not seen in last 7 days)
                await db.query(`
                    UPDATE products
                    SET stock_status = 'out_of_stock'
                    WHERE merchant_id = $1
                      AND indexed_at < NOW() - INTERVAL '7 days'
                      AND stock_status != 'out_of_stock'
                `, [merchant.id]);

            } catch (error) {
                console.error(`[indexProducts] ✗ ${merchant.domain}: ${error.message}`);
            }

            // Rate limiting: small delay between merchants
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[indexProducts] Completed in ${duration}s: ${merchantsProcessed} merchants, ${totalIndexed} products indexed`);

        return { merchants_processed: merchantsProcessed, products_indexed: totalIndexed };
    } catch (error) {
        console.error('[indexProducts] Job failed:', error);
        throw error;
    }
}

module.exports = { indexProducts };
