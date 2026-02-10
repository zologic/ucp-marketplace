/**
 * Public API Routes
 * Consumer-facing endpoints (tenant-aware)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

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
            SELECT p.id, p.name, p.description, p.price_cents, p.currency,
                   p.image_url, p.stock_status, p.merchant_id, m.domain as merchant_domain,
                   COALESCE(t.name, m.domain) as merchant_name
            FROM products p
            JOIN merchants m ON p.merchant_id = m.id
            LEFT JOIN tenants t ON m.tenant_id = t.id
            WHERE p.tenant_id = $1
              AND p.merchant_id = ANY($2::uuid[])
              AND to_tsvector('english', COALESCE(p.name, '') || ' ' ||
                                         COALESCE(p.description, '') || ' ' ||
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

        searchQuery += ` AND p.stock_status = 'in_stock' ORDER BY p.indexed_at DESC LIMIT 20`;

        const productsResult = await req.app.locals.db.query(searchQuery, queryParams);

        // Log search events for each product returned
        const intentHash = hashIntent(intent);
        for (const product of productsResult.rows) {
            await req.app.locals.db.query(`
                INSERT INTO search_events (tenant_id, merchant_id, product_id, intent_hash, category, brand, max_price_cents, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [tenantId, product.merchant_id, product.id, intentHash, intent.category, intent.brand, intent.max_price_cents, intent.currency]);
        }

        res.json({
            results: productsResult.rows.map(p => ({
                id: p.id,
                merchant_id: p.merchant_id,
                merchant_name: p.merchant_name,
                name: p.name,
                price_cents: p.price_cents,
                currency: p.currency,
                image_url: p.image_url,
                stock_status: p.stock_status
            })),
            count: productsResult.rows.length
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// POST /api/checkout - Create checkout session
router.post('/checkout', async (req, res) => {
    try {
        const { merchant_id, product_id, quantity = 1 } = req.body;
        const tenantId = req.tenant.id;

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

        // Generate referral ID
        const referralId = crypto.randomUUID();

        // Generate session ID for click deduplication
        const sessionId = req.body.session_id || crypto.randomUUID();

        // Log click event (with deduplication check)
        const recentClick = await req.app.locals.db.query(`
            SELECT id FROM click_events
            WHERE session_id = $1 AND product_id = $2 AND created_at > NOW() - INTERVAL '5 minutes'
        `, [sessionId, product_id]);

        if (recentClick.rows.length === 0) {
            // Not a duplicate, log the click
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
        }

        // Call merchant UCP checkout endpoint (this would normally create the session on merchant side)
        // For now, we'll create a placeholder checkout URL
        const checkoutUrl = `${merchant.domain}/checkout?ref=${referralId}`;

        // Create checkout session record
        await req.app.locals.db.query(`
            INSERT INTO checkout_sessions (tenant_id, merchant_id, product_id, referral_id, session_url, status)
            VALUES ($1, $2, $3, $4, $5, 'created')
        `, [tenantId, merchant_id, product_id, referralId, checkoutUrl]);

        res.json({
            checkout_url: checkoutUrl,
            referral_id: referralId
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

module.exports = router;
