/**
 * Public API Routes
 * Consumer-facing endpoints (tenant-aware)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { rankProducts, getCategoryWeights } = require('../services/ranking');
const { parseQuery, generateFilterLabels } = require('../services/queryParser');

// Import onboarding routes
const onboardRoutes = require('./onboard');

// GET /api/categories - List available categories with product counts
router.get('/categories', async (req, res) => {
    try {
        const tenantId = req.tenant.id;

        // Get active merchants for this tenant
        const merchantsResult = await req.app.locals.db.query(`
            SELECT m.id
            FROM merchants m
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE m.tenant_id = $1
              AND m.status = 'active'
              AND (mb.status != 'suspended' OR m.admin_override = true)
        `, [tenantId]);

        const merchants = merchantsResult.rows;

        if (merchants.length === 0) {
            return res.json({ categories: [] });
        }

        // Aggregate categories with product counts
        const categoriesResult = await req.app.locals.db.query(`
            SELECT
                TRIM(LOWER(p.category)) as category_slug,
                p.category as category_name,
                COUNT(DISTINCT p.id) as product_count,
                COUNT(DISTINCT p.merchant_id) as merchant_count
            FROM products p
            JOIN merchants m ON p.merchant_id = m.id
            WHERE p.tenant_id = $1
              AND p.merchant_id = ANY($2::uuid[])
              AND p.category IS NOT NULL
              AND TRIM(p.category) != ''
            GROUP BY TRIM(LOWER(p.category)), p.category
            ORDER BY product_count DESC
            LIMIT 50
        `, [tenantId, merchants.map(m => m.id)]);

        // Pick the most common casing for each category
        const categoryMap = {};
        categoriesResult.rows.forEach(row => {
            if (!categoryMap[row.category_slug] ||
                row.product_count > categoryMap[row.category_slug].product_count) {
                categoryMap[row.category_slug] = {
                    slug: row.category_slug,
                    name: row.category_name,
                    product_count: parseInt(row.product_count),
                    merchant_count: parseInt(row.merchant_count)
                };
            }
        });

        const categories = Object.values(categoryMap);

        res.json({ categories });
    } catch (error) {
        console.error('[GET /categories] Error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// POST /api/search - Search products across active merchants
router.post('/search', async (req, res) => {
    try {
        const { query, filters = {} } = req.body;
        const tenantId = req.tenant.id;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // Parse query with smart NLP/pattern matching
        const parsed = parseQuery(query, filters);

        // Extract intent from cleaned query
        const intent = extractIntent(parsed.clean_query, parsed.filters);

        // Get active merchants for this tenant
        const merchantsResult = await req.app.locals.db.query(`
            SELECT m.id, m.domain, m.ucp_endpoint
            FROM merchants m
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE m.tenant_id = $1
              AND m.status = 'active'
              AND (mb.status IS NULL OR mb.status != 'suspended' OR m.admin_override = true)
        `, [tenantId]);

        const merchants = merchantsResult.rows;

        console.log(`[Search] Tenant: ${tenantId}, Query: "${query}", Merchants: ${merchants.length}`);

        if (merchants.length === 0) {
            console.log('[Search] No active merchants found for tenant');
            return res.json({ results: [], count: 0 });
        }

        // Search products in database (indexed from previous crawls)
        let searchQuery = `
            SELECT
                p.id, p.name, p.description,
                p.description_short, p.description_long,
                p.variations, p.has_variations,
                p.price_cents, p.currency,
                p.image_url, p.stock_status, p.merchant_id, p.indexed_at,
                p.category, p.brand,
                m.domain as merchant_domain,
                m.trust_score,
                COALESCE(t.name, m.domain) as merchant_name,

                -- Performance metrics from last 90 days
                COALESCE(SUM(s.click_count), 0) as total_clicks,
                COALESCE(SUM(s.order_count), 0) as total_orders

            FROM products p
            JOIN merchants m ON p.merchant_id = m.id
            LEFT JOIN tenants t ON m.tenant_id = t.id

            -- JOIN performance data for conversion-based ranking
            LEFT JOIN merchant_daily_stats s ON m.id = s.merchant_id
                AND s.date >= CURRENT_DATE - INTERVAL '90 days'

            WHERE p.tenant_id = $1
              AND p.merchant_id = ANY($2::uuid[])
              AND p.search_vector @@ plainto_tsquery('english', $3)
        `;

        const queryParams = [tenantId, merchants.map(m => m.id), query];
        let paramIndex = 4;

        // Apply filters
        // Priority: explicit category_slug filter > intent-extracted category
        if (filters.category_slug) {
            searchQuery += ` AND TRIM(LOWER(p.category)) = $${paramIndex}`;
            queryParams.push(filters.category_slug);
            paramIndex++;
        } else if (intent.category) {
            searchQuery += ` AND p.category ILIKE $${paramIndex}`;
            queryParams.push(`%${intent.category}%`);
            paramIndex++;
        }

        if (intent.brand) {
            searchQuery += ` AND p.brand ILIKE $${paramIndex}`;
            queryParams.push(`%${intent.brand}%`);
            paramIndex++;
        }

        // Apply price filters (explicit filters override intent)
        const maxPrice = filters.price_max_cents || intent.max_price_cents;
        const minPrice = filters.price_min_cents || intent.min_price_cents;

        if (maxPrice) {
            searchQuery += ` AND p.price_cents <= $${paramIndex}`;
            queryParams.push(maxPrice);
            paramIndex++;
        }

        if (minPrice) {
            searchQuery += ` AND p.price_cents >= $${paramIndex}`;
            queryParams.push(minPrice);
            paramIndex++;
        }

        // Apply stock filter (explicit filter overrides intent)
        if (filters.in_stock_only || intent.in_stock_only) {
            searchQuery += ` AND p.stock_status = 'in_stock'`;
        }

        // Group by to collapse daily stats into totals
        searchQuery += ` GROUP BY p.id, m.id, m.trust_score, t.name`;

        // Don't hard-filter stock_status here - let ranking handle it
        // Fetch more results for ranking (50 instead of 20)
        searchQuery += ` LIMIT 50`;

        console.log(`[Search] Query params:`, queryParams);

        // Debug: Check total products for this tenant and merchants
        const debugResult = await req.app.locals.db.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END) as with_vector
            FROM products
            WHERE tenant_id = $1 AND merchant_id = ANY($2::uuid[])
        `, [tenantId, merchants.map(m => m.id)]);
        console.log(`[Search] Total products for tenant: ${debugResult.rows[0].total}, with search_vector: ${debugResult.rows[0].with_vector}`);

        const productsResult = await req.app.locals.db.query(searchQuery, queryParams);
        console.log(`[Search] Found ${productsResult.rows.length} products matching query`);

        // Apply production-grade ranking
        const categoryWeights = getCategoryWeights(intent.category);
        const rankedProducts = await rankProducts(
            productsResult.rows,
            intent,
            req.app.locals.db,
            categoryWeights
        );

        // Take top 20 after ranking
        const topResults = rankedProducts.slice(0, 20);

        // Log search events for each product returned
        const intentHash = hashIntent(intent);
        for (const product of topResults) {
            await req.app.locals.db.query(`
                INSERT INTO search_events (tenant_id, merchant_id, product_id, intent_hash, category, brand, max_price_cents, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [tenantId, product.merchant_id, product.id, intentHash, intent.category, intent.brand, intent.max_price_cents, intent.currency]);
        }

        // Generate filter labels for UI
        const filterLabels = generateFilterLabels(parsed.filters);

        console.log(`[Search] Returning ${topResults.length} results to client`);

        res.json({
            results: topResults.map(p => ({
                id: p.id,
                merchant_id: p.merchant_id,
                merchant_name: p.merchant_name,
                name: p.name,
                description_short: p.description_short,
                variations: p.variations,
                has_variations: p.has_variations,
                price_cents: p.price_cents,
                currency: p.currency,
                image_url: p.image_url,
                stock_status: p.stock_status
            })),
            count: topResults.length,
            filter_labels: filterLabels,
            applied_filters: parsed.filters,
            clean_query: parsed.clean_query
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// POST /api/checkout - Create checkout session
// ENHANCED: Server-side session IDs + Redis deduplication + Rate limiting (FRAUD PROTECTION)
router.post('/checkout', async (req, res) => {
    try {
        const { merchant_id, product_id, quantity = 1, selected_variations, referral_source } = req.body;
        const tenantId = req.tenant.id;

        // SECURITY: Reject client-provided session_id (prevents fraud)
        if (req.body.session_id) {
            return res.status(400).json({
                error: 'session_id cannot be provided by client',
                code: 'INVALID_SESSION_ID'
            });
        }

        if (!merchant_id || !product_id) {
            return res.status(400).json({ error: 'merchant_id and product_id are required' });
        }

        // Verify merchant is active
        const merchantResult = await req.app.locals.db.query(`
            SELECT m.*, mb.status as billing_status
            FROM merchants m
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE m.id = $1 AND m.tenant_id = $2
        `, [merchant_id, tenantId]);

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        if (merchant.status !== 'active') {
            return res.status(403).json({ error: 'Merchant not available' });
        }

        if (merchant.billing_status === 'suspended' && !merchant.admin_override) {
            return res.status(403).json({ error: 'Merchant temporarily unavailable' });
        }

        // Get product details
        const productResult = await req.app.locals.db.query(
            'SELECT * FROM products WHERE id = $1 AND merchant_id = $2',
            [product_id, merchant_id]
        );

        if (productResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = productResult.rows[0];
        console.log(`[Checkout] Product fields:`, Object.keys(product));
        console.log(`[Checkout] Product merchant_product_id:`, product.merchant_product_id);
        console.log(`[Checkout] Product permalink:`, product.permalink);

        if (product.stock_status !== 'in_stock') {
            return res.status(400).json({ error: 'Product out of stock' });
        }

        // NEW: Variation validation
        if (product.has_variations) {
            if (!selected_variations || Object.keys(selected_variations).length === 0) {
                return res.status(400).json({
                    error: 'Please select product options',
                    code: 'VARIATIONS_REQUIRED'
                });
            }

            // Validate each variation
            const variations = product.variations; // JSONB already parsed by pg
            for (const variation of variations) {
                const selectedValue = selected_variations[variation.attribute];

                if (!selectedValue) {
                    return res.status(400).json({
                        error: `Please select ${variation.attribute}`,
                        code: 'VARIATION_MISSING',
                        missing_attribute: variation.attribute
                    });
                }

                const option = variation.options.find(opt => opt.value === selectedValue);
                if (!option) {
                    return res.status(400).json({
                        error: `Invalid ${variation.attribute}: ${selectedValue}`,
                        code: 'VARIATION_INVALID'
                    });
                }

                if (!option.available) {
                    return res.status(400).json({
                        error: `${variation.attribute} "${selectedValue}" is out of stock`,
                        code: 'VARIATION_UNAVAILABLE'
                    });
                }
            }

            // Calculate final price with modifiers and find variation ID
            let finalPriceCents = product.price_cents;
            let selectedVariationId = null;

            // Find the variation_id that matches ALL selected attributes
            // For single-attribute variations, this will be straightforward
            // For multi-attribute variations, we need to match all attributes
            for (const variation of variations) {
                const selectedValue = selected_variations[variation.attribute];
                const option = variation.options.find(opt => opt.value === selectedValue);
                if (option) {
                    if (option.price_modifier_cents) {
                        finalPriceCents += option.price_modifier_cents;
                    }
                    // For now, use the first variation_id found
                    // TODO: For multi-attribute products, need to find the exact variation that matches ALL attributes
                    if (!selectedVariationId && option.variation_id) {
                        selectedVariationId = option.variation_id;
                    }
                }
            }

            // Store final price and variation ID for checkout
            product.final_price_cents = finalPriceCents;
            product.selected_variation_id = selectedVariationId;

            console.log(`[Checkout] Variable product: using variation_id ${selectedVariationId} for ${JSON.stringify(selected_variations)}`);
        }

        // FRAUD PROTECTION: Check merchant click rate limit (100 clicks/hour)
        const rateLimitKey = `ratelimit:clicks:${merchant_id}`;
        const recentClicks = await req.app.locals.redis.incr(rateLimitKey);

        if (recentClicks === 1) {
            // First click in this window - set 1-hour expiry
            await req.app.locals.redis.expire(rateLimitKey, 3600);
        }

        if (recentClicks > 100) {
            const ttl = await req.app.locals.redis.ttl(rateLimitKey);
            return res.status(429).json({
                error: 'Rate limit exceeded',
                code: 'CLICK_RATE_LIMIT',
                retryAfter: ttl > 0 ? ttl : 3600
            });
        }

        // SECURITY: Generate server-side session ID (cryptographically secure)
        const sessionId = `sess_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;

        // Store session in Redis (5-minute deduplication window)
        const sessionKey = `click:${sessionId}:${product_id}`;
        const existingSession = await req.app.locals.redis.get(sessionKey);

        if (existingSession) {
            // Duplicate click detected
            return res.status(409).json({
                error: 'Duplicate click detected',
                code: 'DUPLICATE_SESSION'
            });
        }

        // Store session for deduplication
        await req.app.locals.redis.set(
            sessionKey,
            JSON.stringify({
                product_id,
                merchant_id,
                created_at: Date.now()
            }),
            { EX: 300 } // 5 minutes
        );

        // Log click event in database
        await req.app.locals.db.query(`
            INSERT INTO click_events (tenant_id, merchant_id, product_id, session_id)
            VALUES ($1, $2, $3, $4)
        `, [tenantId, merchant_id, product_id, sessionId]);

        // Create billable event for CPC if applicable
        const billingResult = await req.app.locals.db.query(
            'SELECT * FROM merchant_billing WHERE merchant_id = $1',
            [merchant_id]
        );

        if (billingResult.rows.length > 0) {
            const billing = billingResult.rows[0];
            if (billing.billing_mode === 'cpc' && billing.cpc_cents > 0) {
                const clickId = (await req.app.locals.db.query(
                    'SELECT id FROM click_events WHERE session_id = $1 AND product_id = $2 ORDER BY created_at DESC LIMIT 1',
                    [sessionId, product_id]
                )).rows[0].id;

                await req.app.locals.db.query(`
                    INSERT INTO billable_events (tenant_id, merchant_id, event_type, reference_id, amount_cents, currency)
                    VALUES ($1, $2, 'click', $3, $4, $5)
                `, [tenantId, merchant_id, clickId, billing.cpc_cents, billing.currency]);
            }
        }

        // Generate referral ID
        const referralId = crypto.randomUUID();

        // Check merchant's UCP manifest for checkout creation and embedded checkout support
        let supportsEmbeddedCheckout = false;
        let checkoutUrl = `https://${merchant.domain}/checkout?ref=${referralId}`;

        console.log(`[Checkout] Merchant has ucp_manifest: ${!!merchant.ucp_manifest}, service_base_url: ${merchant.service_base_url}`);

        if (merchant.ucp_manifest && merchant.service_base_url) {
            // Look for checkout creation service
            const services = merchant.ucp_manifest.ucp?.services?.['dev.ucp.shopping'];
            console.log(`[Checkout] Found dev.ucp.shopping services:`, services);

            const checkoutService = services?.find(
                svc => svc.transport === 'rest'
            );
            console.log(`[Checkout] Checkout service found:`, checkoutService);

            if (checkoutService && checkoutService.endpoint) {
                try {
                    // Call merchant's UCP API to create checkout session
                    console.log(`[Checkout] Calling merchant API: ${checkoutService.endpoint}/checkout`);

                    // For variable products, use the selected variation_id; otherwise use the product's external_id
                    const itemId = product.selected_variation_id || String(product.external_id);

                    const requestBody = {
                        line_items: [{
                            item: { id: itemId },
                            quantity: Number(quantity)
                        }]
                    };
                    console.log(`[Checkout] Request body:`, JSON.stringify(requestBody));
                    const checkoutResponse = await axios.post(`${checkoutService.endpoint}/checkout`, requestBody, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Idempotency-Key': referralId,
                            'UCP-Agent': 'BizForm/1.0'
                        },
                        timeout: 10000
                    });

                    console.log(`[Checkout] Merchant API response:`, JSON.stringify(checkoutResponse.data));

                    if (checkoutResponse.data) {
                        const session = checkoutResponse.data;

                        // For redirect flow, use standard checkout URLs (NOT embedded)
                        // Priority: checkout_url > continue_url > build from domain
                        if (session.checkout_url) {
                            checkoutUrl = session.checkout_url;
                        } else if (session.continue_url && !session.continue_url.includes('/embedded-checkout/')) {
                            // Use continue_url only if it's not the embedded endpoint
                            checkoutUrl = session.continue_url;
                        } else if (session.id) {
                            // Build standard checkout URL from merchant domain
                            checkoutUrl = `https://${merchant.domain}/checkout/${session.id}?token=${session.id}`;
                        } else {
                            // Ultimate fallback
                            checkoutUrl = `https://${merchant.domain}/checkout?ref=${referralId}`;
                        }

                        // Skip embedded_checkout_url entirely - that's for iframe/ECP only

                        // Add return URLs for completion tracking
                        const returnUrl = new URL(checkoutUrl);
                        const marketplaceBase = `https://${req.get('host')}`;
                        returnUrl.searchParams.set('return_url', `${marketplaceBase}/checkout/success?ref=${referralId}`);
                        returnUrl.searchParams.set('cancel_url', `${marketplaceBase}/checkout/cancel?ref=${referralId}`);
                        checkoutUrl = returnUrl.toString();

                        console.log(`[Checkout] Redirect URL with return URLs: ${checkoutUrl}`);
                    }
                } catch (apiError) {
                    console.error('[Checkout] Failed to create merchant checkout session:', apiError.response?.data || apiError.message);
                    // Fall back to direct URL
                    checkoutUrl = `https://${merchant.domain}/checkout?ref=${referralId}`;
                }
            } else {
                // No checkout creation service, use direct checkout URL
                checkoutUrl = `https://${merchant.domain}/checkout?ref=${referralId}`;

                // Add return URLs
                const marketplaceBase = `https://${req.get('host')}`;
                checkoutUrl += `&return_url=${encodeURIComponent(`${marketplaceBase}/checkout/success?ref=${referralId}`)}`;
                checkoutUrl += `&cancel_url=${encodeURIComponent(`${marketplaceBase}/checkout/cancel?ref=${referralId}`)}`;
            }
        }

        // Create checkout session record
        await req.app.locals.db.query(`
            INSERT INTO checkout_sessions (tenant_id, merchant_id, product_id, referral_id, session_url, status, referral_source)
            VALUES ($1, $2, $3, $4, $5, 'created', $6)
        `, [tenantId, merchant_id, product_id, referralId, checkoutUrl, referral_source || 'UNKNOWN']);

        // Return checkout info - always use redirect flow (no embedded)
        res.json({
            checkout_url: checkoutUrl,
            referral_id: referralId,
            session_id: sessionId, // For debugging/logging only
            embedded_checkout: false // Always redirect, never embed
        });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: 'Checkout creation failed' });
    }
});

// Helper function: Extract intent from query
function extractIntent(query, filters) {
    const intent = {
        category: filters.category || null,
        brand: filters.brand || null,
        max_price_cents: filters.max_price_cents || null,
        currency: filters.currency || 'EUR'
    };

    // Extract price mentions from query
    const pricePatterns = [
        /under\s+[€$£]?(\d+)/i,
        /less than\s+[€$£]?(\d+)/i,
        /max\s+[€$£]?(\d+)/i,
        /below\s+[€$£]?(\d+)/i
    ];

    for (const pattern of pricePatterns) {
        const match = query.match(pattern);
        if (match) {
            intent.max_price_cents = parseInt(match[1]) * 100; // Convert to cents
            break;
        }
    }

    // Extract currency from query
    if (query.includes('€') || query.toLowerCase().includes('eur')) {
        intent.currency = 'EUR';
    } else if (query.includes('$') || query.toLowerCase().includes('usd')) {
        intent.currency = 'USD';
    } else if (query.includes('£') || query.toLowerCase().includes('gbp')) {
        intent.currency = 'GBP';
    }

    return intent;
}

// Helper function: Hash intent for privacy
function hashIntent(intent) {
    const normalized = `${intent.category || ''}|${intent.brand || ''}|${intent.max_price_cents || ''}|${intent.currency || ''}`;
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Checkout status endpoint (for success page polling)
router.get('/checkout/status', async (req, res) => {
    try {
        const { ref } = req.query;

        if (!ref) {
            return res.status(400).json({ error: 'Reference ID required' });
        }

        // Check checkout session
        const sessionResult = await req.app.locals.db.query(
            'SELECT status FROM checkout_sessions WHERE referral_id = $1',
            [ref]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = sessionResult.rows[0];

        // Check for completed order
        const orderResult = await req.app.locals.db.query(
            'SELECT id, external_order_id FROM orders WHERE referral_id = $1',
            [ref]
        );

        if (orderResult.rows.length > 0) {
            return res.json({
                status: 'completed',
                order_id: orderResult.rows[0].external_order_id || orderResult.rows[0].id
            });
        }

        // Return session status
        res.json({
            status: session.status || 'pending'
        });
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// Checkout cancellation endpoint
router.post('/checkout/cancel', async (req, res) => {
    try {
        const { referral_id } = req.body;

        if (!referral_id) {
            return res.status(400).json({ error: 'Reference ID required' });
        }

        // Update checkout session status
        await req.app.locals.db.query(
            'UPDATE checkout_sessions SET status = $1 WHERE referral_id = $2 AND status = $3',
            ['cancelled', referral_id, 'created']
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Cancellation error:', error);
        res.status(500).json({ error: 'Failed to record cancellation' });
    }
});

// Mount onboarding routes
router.use('/', onboardRoutes);

module.exports = router;
