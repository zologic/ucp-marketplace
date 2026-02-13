/**
 * Job: Index Products from Merchants
 * Frequency: Every 6 hours
 *
 * Uses UCP dynamic capability discovery to fetch products.
 * Tracks indexing attempts in merchant_index_log table.
 */

const axios = require('axios');
const { parseManifest } = require('/app/utils/ucpParser');

async function indexProducts(db) {
    const startTime = Date.now();
    console.log('[indexProducts] Starting...');

    try {
        // Get merchants due for crawling based on their crawl_interval_hours
        const result = await db.query(`
            SELECT
                m.id,
                m.domain,
                m.tenant_id,
                m.service_base_url,
                m.ucp_manifest,
                m.manifest_hash,
                m.public_key,
                m.crawl_interval_hours,
                m.last_indexed_at
            FROM merchants m
            WHERE m.status = 'active'
              AND m.service_base_url IS NOT NULL
              AND m.ucp_manifest IS NOT NULL
              AND (
                m.last_indexed_at IS NULL
                OR m.last_indexed_at < NOW() - (m.crawl_interval_hours || ' hours')::INTERVAL
              )
            ORDER BY m.last_indexed_at ASC NULLS FIRST
            LIMIT 50
        `);

        const merchants = result.rows;
        console.log(`[indexProducts] Found ${merchants.length} merchants due for indexing`);

        let totalIndexed = 0;
        let totalFailed = 0;
        let merchantsProcessed = 0;

        for (const merchant of merchants) {
            let logId = null;
            let productsIndexed = 0;
            let productsFailed = 0;

            try {
                // Use cached manifest from database
                const parsedManifest = parseManifest(merchant.ucp_manifest);

                // Find products capability using dynamic discovery
                const productsCap = parsedManifest.capabilities.find(
                    cap => cap.name === 'dev.ucp.shopping.products' && cap.supported
                );

                if (!productsCap) {
                    console.warn(`[indexProducts] No products capability for ${merchant.domain}`);

                    // Log failed attempt - no products capability
                    await logIndexAttempt(db, merchant.id, 'failed', 0, 0, 'NO_PRODUCTS_CAPABILITY', merchant.manifest_hash);
                    continue;
                }

                const productsEndpoint = productsCap.endpoint;
                console.log(`[indexProducts] ${merchant.domain} products endpoint: ${productsEndpoint}`);

                // Create log entry for this indexing attempt
                const logResult = await db.query(`
                    INSERT INTO merchant_index_log (merchant_id, started_at, status, manifest_hash)
                    VALUES ($1, NOW(), 'in_progress', $2)
                    RETURNING id
                `, [merchant.id, merchant.manifest_hash]);

                logId = logResult.rows[0].id;

                // Fetch products from merchant using dynamic endpoint
                // Don't send limit parameter - let merchant use their default
                const productsResponse = await axios.get(productsEndpoint, {
                    timeout: 30000
                });

                const products = productsResponse.data.data || productsResponse.data.products || [];

                // First, process and create categories with full metadata from UCP
                const categoryMap = new Map(); // slug -> category data
                for (const product of products) {
                    if (product.categories && Array.isArray(product.categories)) {
                        for (const cat of product.categories) {
                            if (cat.slug && !categoryMap.has(cat.slug)) {
                                categoryMap.set(cat.slug, {
                                    name: cat.name,
                                    slug: cat.slug,
                                    google_taxonomy_id: cat.google_taxonomy_id || null,
                                    google_taxonomy_path: cat.google_taxonomy_path || null,
                                    description: cat.description || null,
                                    image_url: cat.image_url || null
                                });
                            }
                        }
                    }
                }

                // Bulk upsert categories with full metadata
                for (const [slug, catData] of categoryMap) {
                    try {
                        await db.query(`
                            INSERT INTO categories (
                                tenant_id, name, slug, google_taxonomy_id,
                                google_taxonomy_path, description, image_url,
                                is_active, display_order
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0)
                            ON CONFLICT (tenant_id, slug) DO UPDATE SET
                                name = EXCLUDED.name,
                                google_taxonomy_id = COALESCE(EXCLUDED.google_taxonomy_id, categories.google_taxonomy_id),
                                google_taxonomy_path = COALESCE(EXCLUDED.google_taxonomy_path, categories.google_taxonomy_path),
                                description = COALESCE(EXCLUDED.description, categories.description),
                                image_url = COALESCE(EXCLUDED.image_url, categories.image_url),
                                updated_at = NOW()
                        `, [
                            merchant.tenant_id,
                            catData.name,
                            catData.slug,
                            catData.google_taxonomy_id,
                            catData.google_taxonomy_path,
                            catData.description,
                            catData.image_url
                        ]);
                    } catch (catError) {
                        console.warn(`[indexProducts] Failed to upsert category ${catData.name}:`, catError.message);
                    }
                }

                console.log(`[indexProducts] ${merchant.domain}: Processed ${categoryMap.size} categories with metadata`);

                // Upsert products into database with signing_status = 'pending'
                for (const product of products) {
                    try {
                        // Process price - support both UCP 2026 format and legacy
                        let priceCents = product.price_cents;
                        let currency = product.currency || 'EUR';
                        if (!priceCents && product.price && product.price.amount) {
                            priceCents = product.price.amount;
                            currency = product.price.currency || 'EUR';
                        }

                        // Process categories - support UCP 2026 format (array) and legacy (string)
                        let categoryName = null;
                        if (product.categories && Array.isArray(product.categories) && product.categories.length > 0) {
                            // Use first category name from array (for backward compat with product.category field)
                            categoryName = product.categories[0].name;
                        } else if (product.category) {
                            // Legacy format: single category string
                            categoryName = product.category;
                        }

                        // Process images - support UCP 2026 format (array) and legacy (single url)
                        let imageUrl = product.image_url;
                        if (!imageUrl && product.images && Array.isArray(product.images) && product.images.length > 0) {
                            imageUrl = product.images[0].url;
                        }

                        // Process stock status - support both formats
                        let stockStatus = product.stock_status || 'in_stock';
                        if (product.in_stock !== undefined) {
                            stockStatus = product.in_stock ? 'in_stock' : 'out_of_stock';
                        }

                        // Process description fields
                        const descriptionShort = product.description_short ||
                            (product.description ? product.description.substring(0, 150) + (product.description.length > 150 ? '...' : '') : null);
                        const descriptionLong = product.description_long || product.description || null;

                        // Process variations field - Support UCP 2026 format
                        let variations = [];
                        let hasVariations = false;

                        if (product.variations && Array.isArray(product.variations) && product.variations.length > 0) {
                            try {
                                // Check if UCP 2026 format (array of items with id, title, price, attributes)
                                const isUCP2026Format = product.variations[0] &&
                                    product.variations[0].id &&
                                    product.variations[0].attributes;

                                if (isUCP2026Format) {
                                    // Transform UCP 2026 format to internal format
                                    variations = transformUCP2026Variations(product.variations, priceCents || 0);
                                    hasVariations = variations.length > 0;
                                } else {
                                    // Legacy format: array with {attribute, options}
                                    variations = product.variations.filter(v => v.attribute && Array.isArray(v.options));
                                    hasVariations = variations.length > 0;
                                }
                            } catch (varError) {
                                console.warn(`[indexProducts] Invalid variations for product ${product.id}:`, varError.message);
                                variations = [];
                                hasVariations = false;
                            }
                        }

                        await db.query(`
                            INSERT INTO products (
                                merchant_id, tenant_id, external_id, name, description,
                                description_short, description_long, variations, has_variations,
                                price_cents, currency, category, brand, image_url, stock_status,
                                signing_status, indexed_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', NOW())
                            ON CONFLICT (merchant_id, external_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                description = EXCLUDED.description,
                                description_short = EXCLUDED.description_short,
                                description_long = EXCLUDED.description_long,
                                variations = EXCLUDED.variations,
                                has_variations = EXCLUDED.has_variations,
                                price_cents = EXCLUDED.price_cents,
                                currency = EXCLUDED.currency,
                                category = EXCLUDED.category,
                                brand = EXCLUDED.brand,
                                image_url = EXCLUDED.image_url,
                                stock_status = EXCLUDED.stock_status,
                                signing_status = 'pending',
                                indexed_at = NOW()
                        `, [
                            merchant.id,
                            merchant.tenant_id,
                            product.id,
                            product.name,
                            product.description || null,
                            descriptionShort,
                            descriptionLong,
                            JSON.stringify(variations),
                            hasVariations,
                            priceCents,
                            currency,
                            categoryName,
                            product.brand || null,
                            imageUrl,
                            stockStatus
                        ]);

                        // Link product to all its categories
                        if (product.categories && Array.isArray(product.categories)) {
                            for (const cat of product.categories) {
                                if (cat.slug) {
                                    try {
                                        await db.query(`
                                            INSERT INTO product_categories (product_id, category_id)
                                            SELECT p.id, c.id
                                            FROM products p
                                            JOIN categories c ON c.tenant_id = p.tenant_id AND c.slug = $1
                                            WHERE p.merchant_id = $2 AND p.external_id = $3
                                            ON CONFLICT (product_id, category_id) DO NOTHING
                                        `, [cat.slug, merchant.id, product.id]);
                                    } catch (linkError) {
                                        console.warn(`[indexProducts] Failed to link product ${product.id} to category ${cat.slug}:`, linkError.message);
                                    }
                                }
                            }
                        }

                        productsIndexed++;
                        totalIndexed++;
                    } catch (productError) {
                        console.error(`[indexProducts] Failed to index product ${product.id}:`, productError.message);
                        productsFailed++;
                        totalFailed++;
                    }
                }

                // Update merchant's last_indexed_at timestamp
                await db.query(`
                    UPDATE merchants
                    SET last_indexed_at = NOW()
                    WHERE id = $1
                `, [merchant.id]);

                merchantsProcessed++;
                console.log(`[indexProducts] ✓ ${merchant.domain}: ${productsIndexed} products indexed, ${productsFailed} failed`);

                // Mark old products as out of stock (not seen in last 7 days)
                await db.query(`
                    UPDATE products
                    SET stock_status = 'out_of_stock'
                    WHERE merchant_id = $1
                      AND indexed_at < NOW() - INTERVAL '7 days'
                      AND stock_status != 'out_of_stock'
                `, [merchant.id]);

                // Log successful attempt
                await db.query(`
                    UPDATE merchant_index_log
                    SET status = 'success',
                        completed_at = NOW(),
                        products_indexed = $1,
                        products_failed = $2
                    WHERE id = $3
                `, [productsIndexed, productsFailed, logId]);

            } catch (error) {
                console.error(`[indexProducts] ✗ ${merchant.domain}: ${error.message}`);
                if (error.response) {
                    console.error(`[indexProducts] Response status: ${error.response.status}`);
                    console.error(`[indexProducts] Response data:`, error.response.data);
                }

                // Determine error code
                const errorCode = getErrorCode(error);

                // Log failed attempt
                if (logId) {
                    await db.query(`
                        UPDATE merchant_index_log
                        SET status = 'failed',
                            completed_at = NOW(),
                            error_message = $1,
                            error_code = $2,
                            products_indexed = $3,
                            products_failed = $4
                        WHERE id = $5
                    `, [
                        error.message,
                        errorCode,
                        productsIndexed,
                        productsFailed,
                        logId
                    ]);
                } else {
                    // Log entry was never created
                    await logIndexAttempt(db, merchant.id, 'failed', productsIndexed, productsFailed, errorCode, merchant.manifest_hash, error.message);
                }
            }

            // Rate limiting: small delay between merchants
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[indexProducts] Completed in ${duration}s: ${merchantsProcessed} merchants, ${totalIndexed} products indexed, ${totalFailed} failed`);

        return {
            merchants_processed: merchantsProcessed,
            products_indexed: totalIndexed,
            products_failed: totalFailed
        };
    } catch (error) {
        console.error('[indexProducts] Job failed:', error);
        throw error;
    }
}

/**
 * Helper: Log indexing attempt to merchant_index_log
 */
async function logIndexAttempt(db, merchantId, status, productsIndexed, productsFailed, errorCode, manifestHash, errorMessage = null) {
    try {
        await db.query(`
            INSERT INTO merchant_index_log (
                merchant_id, started_at, completed_at, status,
                products_indexed, products_failed, error_message, error_code, manifest_hash
            )
            VALUES ($1, NOW(), NOW(), $2, $3, $4, $5, $6, $7)
        `, [merchantId, status, productsIndexed, productsFailed, errorMessage, errorCode, manifestHash]);
    } catch (logError) {
        console.error('[indexProducts] Failed to log index attempt:', logError.message);
    }
}

/**
 * Helper: Get error code from error object
 */
function getErrorCode(error) {
    if (error.code === 'ENOTFOUND') return 'DNS_ERROR';
    if (error.code === 'ETIMEDOUT') return 'NETWORK_TIMEOUT';
    if (error.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
    if (error.response && error.response.status === 404) return 'ENDPOINT_NOT_FOUND';
    if (error.response && error.response.status === 500) return 'MERCHANT_SERVER_ERROR';
    if (error.response && error.response.status === 429) return 'RATE_LIMITED';
    if (error.name === 'UcpParseError' || error.name === 'UcpValidationError') return 'INVALID_MANIFEST';
    return 'UNKNOWN_ERROR';
}

/**
 * Transform UCP 2026 variations format to internal marketplace format
 *
 * UCP 2026 Input:
 * [
 *   {id: "shoe-123-blue-10", title: "Blue / Size 10", price: 12000, attributes: {color: "Blue", size: "10"}},
 *   {id: "shoe-123-red-10", title: "Red / Size 10", price: 12500, attributes: {color: "Red", size: "10"}}
 * ]
 *
 * Internal Output:
 * [
 *   {
 *     attribute: "color",
 *     options: [
 *       {value: "Blue", available: true, price_modifier_cents: 0, variation_id: "shoe-123-blue-10"},
 *       {value: "Red", available: true, price_modifier_cents: 500, variation_id: "shoe-123-red-10"}
 *     ]
 *   },
 *   {attribute: "size", options: [{value: "10", ...}]}
 * ]
 */
function transformUCP2026Variations(ucpVariations, basePrice) {
    const attributeGroups = {};

    for (const variation of ucpVariations) {
        if (!variation.attributes) continue;

        // Handle both UCP 2026 format {price: {amount: 1000}} and legacy format {price: 1000}
        let variationPrice = basePrice;
        if (variation.price) {
            variationPrice = variation.price.amount || variation.price;
        }
        const priceModifier = variationPrice - basePrice;

        // Handle stock status - support both in_stock (boolean) and stock_status (string)
        let isAvailable = true;
        if (variation.stock_status) {
            isAvailable = variation.stock_status !== 'out_of_stock';
        } else if (variation.in_stock !== undefined) {
            isAvailable = variation.in_stock;
        }

        // Extract each attribute (color, size, etc.)
        for (const [attrKey, attrValue] of Object.entries(variation.attributes)) {
            if (!attributeGroups[attrKey]) {
                attributeGroups[attrKey] = {
                    attribute: attrKey,
                    options: []
                };
            }

            // Check if this option already exists
            const existingOption = attributeGroups[attrKey].options.find(opt => opt.value === attrValue);

            if (!existingOption) {
                attributeGroups[attrKey].options.push({
                    value: String(attrValue),
                    available: isAvailable,
                    price_modifier_cents: priceModifier,
                    variation_id: variation.id // Store UCP variation ID for checkout
                });
            }
        }
    }

    // Convert to array and capitalize attribute names
    return Object.values(attributeGroups).map(group => ({
        attribute: group.attribute.charAt(0).toUpperCase() + group.attribute.slice(1),
        options: group.options
    }));
}

module.exports = { indexProducts };
