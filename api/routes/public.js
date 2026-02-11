/**
 * Public API Routes
 * Consumer-facing endpoints (tenant-aware)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { rankProducts, getCategoryWeights } = require('../services/ranking');

// Import onboarding routes
const onboardRoutes = require('./onboard');

// POST /api/search - Search products across active merchants
router.post('/search', async (req, res) => {
    try {
        const { query, filters = {} } = req.body;
        const tenantId = req.tenant.id;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // Extract intent from query (simple keyword extraction)
        const intent = extractIntent(query, filters);

        // Get active merchants for this tenant
        const merchantsResult = await req.app.locals.db.query(`
            SELECT m.id, m.domain, m.ucp_endpoint
            FROM merchants m
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE m.tenant_id = $1
              AND m.status = 'active'
              AND (mb.status != 'suspended' OR m.admin_override = true)
        `, [tenantId]);

        const merchants = merchantsResult.rows;

        if (merchants.length === 0) {
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
              AND to_tsvector('english', COALESCE(p.name, '') || ' ' ||
                                         COALESCE(p.description, '') || ' ' ||
                                         COALESCE(p.description_short, '') || ' ' ||
                                         COALESCE(p.description_long, '') || ' ' ||
                                         COALESCE(p.category, '') || ' ' ||
                                         COALESCE(p.brand, '')) @@ plainto_tsquery('english', $3)
        `;

        const queryParams = [tenantId, merchants.map(m => m.id), query];
        let paramIndex = 4;

        // Apply filters
        if (intent.category) {
            searchQuery += ` AND p.category ILIKE $${paramIndex}`;
            queryParams.push(`%${intent.category}%`);
            paramIndex++;
        }

        if (intent.brand) {
            searchQuery += ` AND p.brand ILIKE $${paramIndex}`;
            queryParams.push(`%${intent.brand}%`);
            paramIndex++;
        }

        if (intent.max_price_cents) {
            searchQuery += ` AND p.price_cents <= $${paramIndex}`;
            queryParams.push(intent.max_price_cents);
            paramIndex++;
        }

        // Group by to collapse daily stats into totals
        searchQuery += ` GROUP BY p.id, m.id, m.trust_score, t.name`;

        // Don't hard-filter stock_status here - let ranking handle it
        // Fetch more results for ranking (50 instead of 20)
        searchQuery += ` LIMIT 50`;

        const productsResult = await req.app.locals.db.query(searchQuery, queryParams);

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
            count: topResults.length
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
        const { merchant_id, product_id, quantity = 1, selected_variations } = req.body;
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

            // Calculate final price with modifiers
            let finalPriceCents = product.price_cents;
            for (const variation of variations) {
                const selectedValue = selected_variations[variation.attribute];
                const option = variation.options.find(opt => opt.value === selectedValue);
                if (option && option.price_modifier_cents) {
                    finalPriceCents += option.price_modifier_cents;
                }
            }

            // Store final price for checkout URL
            product.final_price_cents = finalPriceCents;
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
        await req.app.locals.redis.setex(
            sessionKey,
            300, // 5 minutes
            JSON.stringify({
                product_id,
                merchant_id,
                created_at: Date.now()
            })
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

        // Check merchant's UCP manifest for embedded checkout support
        let supportsEmbeddedCheckout = false;
        let checkoutUrl = `${merchant.domain}/checkout?ref=${referralId}`;

        if (merchant.ucp_manifest && merchant.ucp_manifest.capabilities) {
            const embeddedCheckoutCap = merchant.ucp_manifest.capabilities.find(
                cap => cap.name === 'dev.ucp.shopping.embedded_checkout' && cap.supported === true
            );

            if (embeddedCheckoutCap && embeddedCheckoutCap.endpoint) {
                supportsEmbeddedCheckout = true;
                // Use the merchant's embedded checkout endpoint
                checkoutUrl = embeddedCheckoutCap.endpoint.includes('?')
                    ? `${embeddedCheckoutCap.endpoint}&ref=${referralId}`
                    : `${embeddedCheckoutCap.endpoint}?ref=${referralId}`;
            }
        }

        // Create checkout session record
        await req.app.locals.db.query(`
            INSERT INTO checkout_sessions (tenant_id, merchant_id, product_id, referral_id, session_url, status)
            VALUES ($1, $2, $3, $4, $5, 'created')
        `, [tenantId, merchant_id, product_id, referralId, checkoutUrl]);

        // Return checkout info with embedded support flag
        res.json({
            checkout_url: checkoutUrl,
            referral_id: referralId,
            session_id: sessionId, // For debugging/logging only
            embedded_checkout: supportsEmbeddedCheckout // NEW: Tells frontend to use iframe
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

// Mount onboarding routes
router.use('/', onboardRoutes);

module.exports = router;
