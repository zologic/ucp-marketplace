/**
 * Admin API Routes
 * Dashboard management endpoints (JWT auth required)
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { parseManifest, UcpParseError, UcpValidationError, UcpKeyError } = require('../utils/ucpParser');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

// POST /admin/login - Admin authentication
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Look up admin user
        const result = await req.app.locals.db.query(
            'SELECT * FROM admins WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const admin = result.rows[0];

        // Check if admin is active
        if (admin.status && admin.status === 'inactive') {
            return res.status(403).json({ error: 'Account is inactive' });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, admin.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last_login timestamp
        await req.app.locals.db.query(
            'UPDATE admins SET last_login = NOW() WHERE id = $1',
            [admin.id]
        );

        // Generate JWT token
        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            admin: {
                id: admin.id,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /admin/merchants - List all merchants
router.get('/merchants', requireAuth, async (req, res) => {
    try {
        const { tenant_id, status, billing_status, search, limit = 20, page = 1 } = req.query;

        // Calculate offset from page
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE clause
        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (tenant_id) {
            whereClause += ` AND m.tenant_id = $${paramIndex}`;
            params.push(tenant_id);
            paramIndex++;
        }

        if (status) {
            whereClause += ` AND m.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (billing_status) {
            whereClause += ` AND mb.status = $${paramIndex}`;
            params.push(billing_status);
            paramIndex++;
        }

        if (search) {
            whereClause += ` AND m.domain ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM merchants m
            JOIN tenants t ON m.tenant_id = t.id
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            ${whereClause}
        `;
        const countResult = await req.app.locals.db.query(countQuery, params);
        const totalCount = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalCount / limitNum);

        // Get paginated data
        const dataQuery = `
            SELECT m.*, t.name as tenant_name, t.domain as tenant_domain,
                   mb.status as billing_status, mb.billing_mode,
                   (SELECT COUNT(*) FROM products p WHERE p.merchant_id = m.id) as products_count
            FROM merchants m
            JOIN tenants t ON m.tenant_id = t.id
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            ${whereClause}
            ORDER BY m.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limitNum, offset);

        const result = await req.app.locals.db.query(dataQuery, params);

        res.json({
            merchants: result.rows,
            count: result.rows.length,
            total: totalCount,
            page: pageNum,
            limit: limitNum,
            total_pages: totalPages
        });
    } catch (error) {
        console.error('List merchants error:', error);
        res.status(500).json({ error: 'Failed to list merchants' });
    }
});

// POST /admin/merchants - Add new merchant
router.post('/merchants', requireAuth, async (req, res) => {
    try {
        let { domain, tenant_id, auto_verify = true } = req.body;

        if (!domain) {
            return res.status(400).json({ error: 'domain is required' });
        }

        // Require tenant_id to be explicitly provided
        if (!tenant_id) {
            return res.status(400).json({
                error: 'tenant_id is required',
                message: 'Please select a tenant for this merchant in the admin UI'
            });
        }

        // Normalize domain
        const normalizedDomain = domain.toLowerCase().trim();

        // Check for duplicates
        const existing = await req.app.locals.db.query(
            'SELECT id FROM merchants WHERE domain = $1 AND tenant_id = $2',
            [normalizedDomain, tenant_id]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Merchant already exists' });
        }

        // Insert merchant
        const result = await req.app.locals.db.query(`
            INSERT INTO merchants (tenant_id, domain, status)
            VALUES ($1, $2, 'pending')
            RETURNING *
        `, [tenant_id, normalizedDomain]);

        const merchant = result.rows[0];

        // Auto-verify if requested (await to ensure it completes)
        if (auto_verify) {
            try {
                const verifyResult = await verifyMerchantUCP(merchant.id, req.app.locals.db);
                // Return merchant with updated status and business_name
                const updatedMerchant = await req.app.locals.db.query(
                    'SELECT * FROM merchants WHERE id = $1',
                    [merchant.id]
                );
                return res.status(201).json({
                    merchant: updatedMerchant.rows[0],
                    verification: verifyResult
                });
            } catch (err) {
                console.error('Auto-verify failed:', err);
                // Return merchant anyway but with verification error
                return res.status(201).json({
                    merchant,
                    verification: { status: 'failed', error: err.message }
                });
            }
        }

        res.status(201).json({ merchant });
    } catch (error) {
        console.error('Add merchant error:', error);
        res.status(500).json({ error: 'Failed to add merchant' });
    }
});

// POST /admin/merchants/:id/verify - Verify merchant UCP endpoints
router.post('/merchants/:id/verify', requireAuth, async (req, res) => {
    try {
        const merchantId = req.params.id;

        const result = await verifyMerchantUCP(merchantId, req.app.locals.db);

        res.json(result);
    } catch (error) {
        console.error('Verify merchant error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// POST /admin/merchants/:id/activate - Activate merchant
router.post('/merchants/:id/activate', requireAuth, async (req, res) => {
    try {
        const merchantId = req.params.id;

        // Check merchant status
        const merchantResult = await req.app.locals.db.query(
            'SELECT * FROM merchants WHERE id = $1',
            [merchantId]
        );

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        // Allow activation from 'verified', 'pending', or 'suspended' status
        if (!['verified', 'pending', 'suspended'].includes(merchant.status)) {
            return res.status(400).json({ error: 'Merchant must be verified, pending, or suspended to activate' });
        }

        // Activate merchant
        await req.app.locals.db.query(
            'UPDATE merchants SET status = $1, updated_at = NOW() WHERE id = $2',
            ['active', merchantId]
        );

        // Trigger MCP reload
        await triggerMCPReload();

        res.json({ status: 'active', activated_at: new Date().toISOString() });
    } catch (error) {
        console.error('Activate merchant error:', error);
        res.status(500).json({ error: 'Activation failed' });
    }
});

// POST /admin/merchants/:id/suspend - Suspend merchant
router.post('/merchants/:id/suspend', requireAuth, async (req, res) => {
    try {
        const merchantId = req.params.id;

        await req.app.locals.db.query(
            'UPDATE merchants SET status = $1, updated_at = NOW() WHERE id = $2',
            ['suspended', merchantId]
        );

        // Trigger MCP reload
        await triggerMCPReload();

        res.json({ status: 'suspended', suspended_at: new Date().toISOString() });
    } catch (error) {
        console.error('Suspend merchant error:', error);
        res.status(500).json({ error: 'Suspension failed' });
    }
});

// DELETE /admin/merchants/:id - Delete merchant
router.delete('/merchants/:id', requireAuth, async (req, res) => {
    try {
        const merchantId = req.params.id;

        // Check if merchant exists
        const merchantResult = await req.app.locals.db.query(
            'SELECT * FROM merchants WHERE id = $1',
            [merchantId]
        );

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        // Delete merchant (CASCADE will handle related records)
        await req.app.locals.db.query(
            'DELETE FROM merchants WHERE id = $1',
            [merchantId]
        );

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'merchant_deleted', 'merchant', merchantId, { domain: merchant.domain });

        // Trigger MCP reload
        await triggerMCPReload();

        res.json({ success: true, deleted_at: new Date().toISOString() });
    } catch (error) {
        console.error('Delete merchant error:', error);
        res.status(500).json({ error: 'Deletion failed' });
    }
});

// POST /admin/merchants/:id/recrawl - Trigger product recrawl
router.post('/merchants/:id/recrawl', requireAuth, async (req, res) => {
    try {
        const merchantId = req.params.id;

        // Get merchant details
        const merchantResult = await req.app.locals.db.query(
            'SELECT * FROM merchants WHERE id = $1',
            [merchantId]
        );

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        if (!merchant.service_base_url) {
            return res.status(400).json({ error: 'Merchant has no service_base_url. Verify UCP manifest first.' });
        }

        // Construct products endpoint URL
        const productsUrl = `${merchant.service_base_url}/products`;

        console.log(`[Recrawl] Fetching products from ${productsUrl}`);

        // Fetch products from merchant's UCP endpoint
        const response = await axios.get(productsUrl, { timeout: 30000 });
        const productsData = response.data;

        console.log(`[Recrawl] Response type: ${typeof productsData}, isArray: ${Array.isArray(productsData)}`);
        console.log(`[Recrawl] Response keys: ${typeof productsData === 'object' ? Object.keys(productsData).join(', ') : 'N/A'}`);

        // Extract products array (handle different response formats)
        let products = [];
        if (Array.isArray(productsData)) {
            // Format 1: Direct array
            products = productsData;
        } else if (productsData.products && Array.isArray(productsData.products)) {
            // Format 2: Wrapped in products field
            products = productsData.products;
        } else if (productsData.data && Array.isArray(productsData.data)) {
            // Format 3: Wrapped in data field
            products = productsData.data;
        } else if (productsData.items && Array.isArray(productsData.items)) {
            // Format 4: Wrapped in items field
            products = productsData.items;
        } else {
            console.error('[Recrawl] Unrecognized response format:', JSON.stringify(productsData).substring(0, 500));
            return res.status(400).json({
                error: 'Invalid products response format',
                details: `Expected array or object with products/data/items field. Got: ${typeof productsData}`,
                sample_keys: typeof productsData === 'object' ? Object.keys(productsData) : null
            });
        }

        console.log(`[Recrawl] Found ${products.length} products`);

        let insertedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;

        // Insert/update products
        for (const product of products) {
            try {
                // If product type is 'variable', fetch full product details including variations
                let productData = product;
                let variations = [];
                let hasVariations = false;

                if (product.type === 'variable') {
                    try {
                        const detailsUrl = `${merchant.service_base_url}/products/${product.id}`;
                        console.log(`[Recrawl] Fetching variable product details from ${detailsUrl}`);
                        const detailsResponse = await axios.get(detailsUrl, { timeout: 10000 });
                        productData = detailsResponse.data;

                        // Parse variations if present
                        if (productData.variations && Array.isArray(productData.variations) && productData.variations.length > 0) {
                            // Transform UCP 2026 variations format
                            const attributeGroups = {};
                            const basePrice = product.price?.amount || 0;

                            for (const variation of productData.variations) {
                                if (!variation.attributes) continue;

                                const variationPrice = variation.price?.amount || basePrice;
                                const priceModifier = variationPrice - basePrice;

                                // Extract each attribute
                                for (const [attrKey, attrValue] of Object.entries(variation.attributes)) {
                                    // Remove "attribute_" prefix if present
                                    const cleanAttrKey = attrKey.replace(/^attribute_/, '');

                                    if (!attributeGroups[cleanAttrKey]) {
                                        attributeGroups[cleanAttrKey] = {
                                            attribute: cleanAttrKey.charAt(0).toUpperCase() + cleanAttrKey.slice(1),
                                            options: []
                                        };
                                    }

                                    // Check if this option already exists
                                    const existingOption = attributeGroups[cleanAttrKey].options.find(opt => opt.value === attrValue);

                                    if (!existingOption) {
                                        attributeGroups[cleanAttrKey].options.push({
                                            value: String(attrValue),
                                            available: variation.in_stock !== false,
                                            price_modifier_cents: priceModifier,
                                            variation_id: String(variation.id)
                                        });
                                    }
                                }
                            }

                            variations = Object.values(attributeGroups);
                            hasVariations = variations.length > 0;
                            console.log(`[Recrawl] Product ${product.id} has ${variations.length} variation attributes`);
                        }
                    } catch (detailsError) {
                        console.error(`[Recrawl] Failed to fetch details for variable product ${product.id}:`, detailsError.message);
                        // Continue with basic product data from list
                    }
                }

                // Check if product already exists
                const existingProduct = await req.app.locals.db.query(
                    'SELECT id FROM products WHERE merchant_id = $1 AND external_id = $2',
                    [merchantId, product.id]
                );

                if (existingProduct.rows.length > 0) {
                    // Update existing product
                    await req.app.locals.db.query(`
                        UPDATE products
                        SET
                            name = $1,
                            description = $2,
                            price_cents = $3,
                            currency = $4,
                            category = $5,
                            brand = $6,
                            image_url = $7,
                            stock_status = $8,
                            has_variations = $9,
                            variations = $10,
                            indexed_at = NOW()
                        WHERE merchant_id = $11 AND external_id = $12
                    `, [
                        productData.name || 'Untitled Product',
                        productData.description || '',
                        productData.price?.amount || 0,
                        productData.price?.currency || 'USD',
                        productData.category || null,
                        productData.brand || null,
                        productData.images?.[0]?.url || productData.image_url || null,
                        productData.in_stock !== false ? 'in_stock' : 'out_of_stock',
                        hasVariations,
                        JSON.stringify(variations),
                        merchantId,
                        product.id
                    ]);
                    updatedCount++;
                } else {
                    // Insert new product
                    await req.app.locals.db.query(`
                        INSERT INTO products (
                            merchant_id, tenant_id, external_id, name, description,
                            price_cents, currency, category, brand, image_url, stock_status,
                            has_variations, variations, indexed_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
                    `, [
                        merchantId,
                        merchant.tenant_id,
                        product.id,
                        productData.name || 'Untitled Product',
                        productData.description || '',
                        productData.price?.amount || 0,
                        productData.price?.currency || 'USD',
                        productData.category || null,
                        productData.brand || null,
                        productData.images?.[0]?.url || productData.image_url || null,
                        productData.in_stock !== false ? 'in_stock' : 'out_of_stock',
                        hasVariations,
                        JSON.stringify(variations)
                    ]);
                    insertedCount++;
                }
            } catch (productError) {
                console.error(`[Recrawl] Error processing product ${product.id}:`, productError);
                errorCount++;
            }
        }

        // Update merchant's last_indexed_at
        await req.app.locals.db.query(
            'UPDATE merchants SET last_indexed_at = NOW() WHERE id = $1',
            [merchantId]
        );

        // Auto-create categories from products
        await req.app.locals.db.query(`
            INSERT INTO categories (tenant_id, name, slug, is_active, display_order)
            SELECT DISTINCT
                p.tenant_id,
                p.category as name,
                LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi')) as slug,
                true as is_active,
                0 as display_order
            FROM products p
            WHERE p.merchant_id = $1
              AND p.category IS NOT NULL
              AND p.category != ''
              AND p.category != 'null'
            ON CONFLICT (tenant_id, slug) DO NOTHING
        `, [merchantId]);

        // Auto-link products to categories
        const linkResult = await req.app.locals.db.query(`
            INSERT INTO product_categories (product_id, category_id)
            SELECT DISTINCT
                p.id as product_id,
                c.id as category_id
            FROM products p
            JOIN categories c ON
                c.tenant_id = p.tenant_id
                AND c.slug = LOWER(REGEXP_REPLACE(p.category, '[^a-z0-9]+', '-', 'gi'))
            WHERE p.merchant_id = $1
              AND p.category IS NOT NULL
              AND p.category != ''
              AND p.category != 'null'
              AND NOT EXISTS (
                SELECT 1 FROM product_categories pc
                WHERE pc.product_id = p.id AND pc.category_id = c.id
              )
            RETURNING product_id
        `, [merchantId]);

        console.log(`[Recrawl] Complete: ${insertedCount} inserted, ${updatedCount} updated, ${errorCount} errors, ${linkResult.rows.length} category links created`);

        res.json({
            success: true,
            summary: {
                total: products.length,
                inserted: insertedCount,
                updated: updatedCount,
                errors: errorCount,
                categories_linked: linkResult.rows.length
            },
            indexed_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Recrawl error:', error);

        let errorMessage = 'Failed to recrawl products';
        if (error.code === 'ENOTFOUND') {
            errorMessage = 'Could not connect to merchant API (DNS error)';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'Merchant API request timed out';
        } else if (error.response?.status === 404) {
            errorMessage = 'Products endpoint not found';
        } else if (error.response?.status) {
            errorMessage = `Merchant API returned ${error.response.status} error`;
        }

        res.status(500).json({ error: errorMessage, details: error.message });
    }
});

// POST /admin/merchants/:id/index - Trigger product indexing using worker job
router.post('/merchants/:id/index', requireAuth, async (req, res) => {
    try {
        const merchantId = req.params.id;

        // Verify merchant exists
        const merchantResult = await req.app.locals.db.query(
            'SELECT id, domain FROM merchants WHERE id = $1',
            [merchantId]
        );

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        // Reset last_indexed_at to trigger immediate re-index
        await req.app.locals.db.query(
            'UPDATE merchants SET last_indexed_at = NULL WHERE id = $1',
            [merchantId]
        );

        // Import and run indexProducts job
        const { indexProducts } = require('../jobs/indexProducts');
        const result = await indexProducts(req.app.locals.db);

        res.json({
            success: true,
            message: `Product indexing triggered for ${merchant.domain}`,
            result: result
        });
    } catch (error) {
        console.error('[Admin] Index products error:', error);
        res.status(500).json({
            error: 'Failed to trigger indexing',
            details: error.message
        });
    }
});

// POST /admin/trigger-rollup - Manually trigger stats rollup job
router.post('/trigger-rollup', requireAuth, async (req, res) => {
    try {
        console.log('[Admin] Manual stats rollup triggered');

        // Import and run rollupStats job
        const { rollupStats } = require('../../worker/jobs/rollupStats');
        const result = await rollupStats(req.app.locals.db);

        res.json({
            success: true,
            message: 'Stats rollup completed',
            result: result
        });
    } catch (error) {
        console.error('[Admin] Stats rollup error:', error);
        res.status(500).json({
            error: 'Failed to trigger stats rollup',
            details: error.message
        });
    }
});

// GET /admin/merchants/:id/analytics - Get merchant analytics
router.get('/merchants/:id/analytics', requireAuth, async (req, res) => {
    try {
        const merchantId = req.params.id;
        const { period = 'month', start_date, end_date } = req.query;

        let dateFilter = '';
        const params = [merchantId];

        if (start_date && end_date) {
            dateFilter = 'AND date BETWEEN $2 AND $3';
            params.push(start_date, end_date);
        } else if (period === 'day') {
            dateFilter = 'AND date >= CURRENT_DATE - INTERVAL \'1 day\'';
        } else if (period === 'week') {
            dateFilter = 'AND date >= CURRENT_DATE - INTERVAL \'7 days\'';
        } else if (period === 'month') {
            dateFilter = 'AND date >= CURRENT_DATE - INTERVAL \'30 days\'';
        }

        // Get aggregated stats
        const statsResult = await req.app.locals.db.query(`
            SELECT
                SUM(search_count) as search_count,
                SUM(click_count) as click_count,
                SUM(checkout_count) as checkout_count,
                SUM(order_count) as order_count,
                SUM(revenue_cents) as revenue_cents
            FROM merchant_daily_stats
            WHERE merchant_id = $1 ${dateFilter}
        `, params);

        const stats = statsResult.rows[0];

        // Calculate conversion rate
        const conversionRate = stats.click_count > 0
            ? ((stats.order_count / stats.click_count) * 100).toFixed(2)
            : 0;

        res.json({
            period: { start: start_date, end: end_date },
            summary: {
                search_count: parseInt(stats.search_count) || 0,
                click_count: parseInt(stats.click_count) || 0,
                checkout_count: parseInt(stats.checkout_count) || 0,
                order_count: parseInt(stats.order_count) || 0,
                revenue_cents: parseInt(stats.revenue_cents) || 0,
                conversion_rate: parseFloat(conversionRate)
            }
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

// POST /admin/mcp/reload - Trigger MCP hot reload
router.post('/mcp/reload', requireAuth, async (req, res) => {
    try {
        await triggerMCPReload();
        res.json({ status: 'reloaded', reloaded_at: new Date().toISOString() });
    } catch (error) {
        console.error('MCP reload error:', error);
        res.status(500).json({ error: 'Reload failed' });
    }
});

// Helper: Verify merchant UCP endpoints
async function verifyMerchantUCP(merchantId, db) {
    const merchantResult = await db.query('SELECT * FROM merchants WHERE id = $1', [merchantId]);

    if (merchantResult.rows.length === 0) {
        throw new Error('Merchant not found');
    }

    const merchant = merchantResult.rows[0];

    // Construct UCP endpoint URL with protocol
    let ucpEndpoint = merchant.ucp_endpoint;
    if (!ucpEndpoint) {
        // Add https:// if not present in domain
        const domain = merchant.domain.startsWith('http')
            ? merchant.domain
            : `https://${merchant.domain}`;
        ucpEndpoint = `${domain}/.well-known/ucp`;
    }

    try {
        // Fetch UCP manifest
        const response = await axios.get(ucpEndpoint, { timeout: 10000 });
        const manifest = response.data;

        // Parse and validate using ucpParser
        let parsedManifest;
        try {
            parsedManifest = parseManifest(manifest);
        } catch (parseError) {
            // Update merchant status to pending if manifest invalid
            await db.query(
                'UPDATE merchants SET status = $1, last_verified_at = NOW() WHERE id = $2',
                ['pending', merchantId]
            );

            return {
                status: 'failed',
                error: `Invalid UCP manifest: ${parseError.message}`,
                error_code: parseError.name === 'UcpParseError' ? 'INVALID_MANIFEST' : 'VALIDATION_FAILED',
                verification_results: {
                    manifest_valid: false,
                    capabilities_discovered: [],
                    business_profile_extracted: false,
                    signing_key_present: false,
                    summary: 'Verification failed'
                }
            };
        }

        // Check if manifest has changed using hash
        const currentHash = parsedManifest.manifestHash;
        const storedHash = merchant.manifest_hash;

        if (currentHash === storedHash && merchant.status === 'verified') {
            // Manifest unchanged, just update verification timestamp
            await db.query(
                'UPDATE merchants SET last_verified_at = NOW() WHERE id = $1',
                [merchantId]
            );

            return {
                status: 'verified',
                message: 'Manifest unchanged - no updates required',
                manifest_hash: currentHash,
                verified_at: new Date().toISOString()
            };
        }

        // Update merchant with ALL extracted data from manifest
        await db.query(`
            UPDATE merchants
            SET
                ucp_endpoint = $1,
                public_key = $2,
                signing_key_id = $3,
                business_name = $4,
                business_description = $5,
                business_url = $6,
                service_base_url = $7,
                ucp_manifest = $8,
                manifest_hash = $9,
                manifest_version = $10,
                status = $11,
                last_verified_at = NOW(),
                updated_at = NOW()
            WHERE id = $12
        `, [
            ucpEndpoint,
            parsedManifest.publicKey,
            parsedManifest.signingKeyId,
            parsedManifest.businessProfile.name,
            parsedManifest.businessProfile.description,
            parsedManifest.businessProfile.website,
            parsedManifest.serviceBaseUrl,
            JSON.stringify(parsedManifest.rawManifest),
            parsedManifest.manifestHash,
            parsedManifest.manifestVersion || null,
            'verified',
            merchantId
        ]);

        // Build verification results with capability discovery
        const capabilityResults = parsedManifest.capabilities;

        // Generate human-readable summary
        const capabilityNames = {
            'dev.ucp.shopping.products': 'Products',
            'dev.ucp.shopping.checkout': 'Checkout',
            'dev.ucp.shopping.search': 'Search',
            'dev.ucp.shopping.webhooks': 'Webhooks'
        };

        const summaryParts = capabilityResults.map(cap => {
            const name = capabilityNames[cap.name] || cap.name;
            const status = cap.supported ? 'Supported' : 'Not Found';
            return `${name}: ${status}`;
        });

        return {
            status: 'verified',
            merchant: {
                id: merchantId,
                business_name: parsedManifest.businessProfile.name,
                status: 'verified',
                ucp_endpoint: ucpEndpoint
            },
            verification_results: {
                manifest_valid: true,
                manifest_hash: parsedManifest.manifestHash,
                capabilities_discovered: capabilityResults,
                business_profile_extracted: true,
                signing_key_present: !!parsedManifest.signingKeyId,
                summary: summaryParts.join(', ')
            },
            verified_at: new Date().toISOString()
        };
    } catch (error) {
        console.error('UCP verification failed:', error.message);

        // Determine error code
        let errorCode = 'UNKNOWN_ERROR';
        if (error.code === 'ENOTFOUND') errorCode = 'DNS_ERROR';
        else if (error.code === 'ETIMEDOUT') errorCode = 'TIMEOUT';
        else if (error.code === 'ECONNREFUSED') errorCode = 'CONNECTION_REFUSED';
        else if (error.response?.status === 404) errorCode = 'MANIFEST_NOT_FOUND';

        await db.query(
            'UPDATE merchants SET last_verified_at = NOW() WHERE id = $1',
            [merchantId]
        );

        return {
            status: 'failed',
            error: error.message,
            error_code: errorCode,
            verification_results: {
                manifest_valid: false,
                capabilities_discovered: [],
                business_profile_extracted: false,
                signing_key_present: false,
                summary: 'Verification failed'
            }
        };
    }
}

// GET /admin/merchants/:id/cpc/preview - Preview CPC billing impact
router.get('/merchants/:id/cpc/preview', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { rate, days = 30 } = req.query;

        // Validation
        if (!rate || rate <= 0) {
            return res.status(400).json({
                error: 'rate parameter required and must be positive'
            });
        }

        const previewRate = parseFloat(rate);
        const previewDays = Math.min(parseInt(days), 90); // Max 90 days

        // Fetch merchant
        const merchantResult = await req.app.locals.db.query(`
            SELECT id, domain, tenant_id, cpc_billing_enabled, cpc_enabled_at, cpc_rate
            FROM merchants
            WHERE id = $1
        `, [id]);

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        // Calculate preview period
        const periodEnd = new Date();
        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - previewDays);

        // Get click count and distribution
        const clickStatsResult = await req.app.locals.db.query(`
            SELECT
                COUNT(*) as total_clicks,
                COUNT(DISTINCT DATE(ce.clicked_at)) as active_days,
                COUNT(DISTINCT se.query) as unique_queries
            FROM click_events ce
            LEFT JOIN search_events se ON ce.search_id = se.id
            WHERE ce.merchant_id = $1
              AND ce.clicked_at >= $2
              AND ce.clicked_at <= $3
        `, [id, periodStart.toISOString(), periodEnd.toISOString()]);

        const clickStats = clickStatsResult.rows[0];
        const totalClicks = parseInt(clickStats.total_clicks) || 0;
        const avgClicksPerDay = previewDays > 0 ? (totalClicks / previewDays).toFixed(1) : 0;

        // Calculate estimated cost
        const estimatedCostCents = totalClicks * previewRate;

        // Get top queries driving clicks
        const topQueriesResult = await req.app.locals.db.query(`
            SELECT
                se.query,
                COUNT(*) as click_count
            FROM click_events ce
            JOIN search_events se ON ce.search_id = se.id
            WHERE ce.merchant_id = $1
              AND ce.clicked_at >= $2
              AND ce.clicked_at <= $3
            GROUP BY se.query
            ORDER BY click_count DESC
            LIMIT 10
        `, [id, periodStart.toISOString(), periodEnd.toISOString()]);

        // Calculate conversion rate if order data exists
        const conversionResult = await req.app.locals.db.query(`
            SELECT
                COUNT(DISTINCT o.id) as total_orders
            FROM orders o
            WHERE o.merchant_id = $1
              AND o.created_at >= $2
              AND o.created_at <= $3
        `, [id, periodStart.toISOString(), periodEnd.toISOString()]);

        const totalOrders = parseInt(conversionResult.rows[0].total_orders) || 0;
        const conversionRate = totalClicks > 0 ? ((totalOrders / totalClicks) * 100).toFixed(2) : 0;

        // Generate recommendation
        let recommendation = 'insufficient_data';
        if (totalClicks >= 100) {
            if (conversionRate >= 2) {
                recommendation = 'recommended'; // Good conversion
            } else if (conversionRate >= 1) {
                recommendation = 'monitor'; // Marginal conversion
            } else {
                recommendation = 'not_recommended'; // Low conversion
            }
        }

        res.json({
            merchant: {
                id: merchant.id,
                domain: merchant.domain,
                cpc_currently_enabled: merchant.cpc_billing_enabled,
                current_rate: merchant.cpc_rate
            },
            preview: {
                rate_cents: previewRate,
                period_days: previewDays,
                period_start: periodStart.toISOString().split('T')[0],
                period_end: periodEnd.toISOString().split('T')[0]
            },
            summary: {
                total_clicks: totalClicks,
                active_days: parseInt(clickStats.active_days) || 0,
                unique_queries: parseInt(clickStats.unique_queries) || 0,
                avg_clicks_per_day: parseFloat(avgClicksPerDay),
                estimated_total_cost_cents: estimatedCostCents,
                estimated_total_cost_formatted: `€${(estimatedCostCents / 100).toFixed(2)}`,
                conversion_rate: parseFloat(conversionRate),
                total_orders: totalOrders
            },
            top_queries: topQueriesResult.rows.map(row => ({
                query: row.query,
                clicks: parseInt(row.click_count),
                estimated_cost_cents: parseInt(row.click_count) * previewRate,
                estimated_cost_formatted: `€${((parseInt(row.click_count) * previewRate) / 100).toFixed(2)}`
            })),
            recommendation: {
                status: recommendation,
                message: getRecommendationMessage(recommendation, totalClicks, conversionRate)
            }
        });

    } catch (error) {
        console.error('[CPC Preview] Error:', error);
        res.status(500).json({
            error: 'Failed to generate CPC preview'
        });
    }
});

// PATCH /admin/merchants/:id/cpc - Toggle CPC billing
router.patch('/merchants/:id/cpc', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled, rate } = req.body;
        const adminId = req.admin.id;
        const adminEmail = req.admin.email;

        // Validation
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({
                error: 'enabled must be a boolean'
            });
        }

        if (enabled && (rate == null || rate <= 0)) {
            return res.status(400).json({
                error: 'rate must be positive when enabling CPC billing'
            });
        }

        // Fetch merchant
        const merchantResult = await req.app.locals.db.query(`
            SELECT id, domain, cpc_billing_enabled, cpc_enabled_at, cpc_rate
            FROM merchants
            WHERE id = $1
        `, [id]);

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        // Update CPC billing status
        let updateQuery;
        let updateParams;

        if (enabled) {
            // Enable CPC billing (reset cpc_enabled_at for non-retroactive billing)
            updateQuery = `
                UPDATE merchants
                SET
                    cpc_billing_enabled = TRUE,
                    cpc_enabled_at = NOW(),
                    cpc_rate = $2,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING cpc_billing_enabled, cpc_enabled_at, cpc_rate
            `;
            updateParams = [id, rate];
        } else {
            // Disable CPC billing (keep cpc_enabled_at for audit trail)
            updateQuery = `
                UPDATE merchants
                SET
                    cpc_billing_enabled = FALSE,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING cpc_billing_enabled, cpc_enabled_at, cpc_rate
            `;
            updateParams = [id];
        }

        const result = await req.app.locals.db.query(updateQuery, updateParams);
        const updated = result.rows[0];

        // Audit log
        console.log(`[CPC Billing] Admin ${adminEmail} (${adminId}) ${enabled ? 'ENABLED' : 'DISABLED'} CPC billing for merchant ${merchant.domain} (${id})${enabled ? ` at rate ${rate}` : ''}`);

        // Store audit record (if audit_logs table exists)
        try {
            await req.app.locals.db.query(`
                INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, details, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
            `, [
                adminId,
                enabled ? 'cpc_billing_enabled' : 'cpc_billing_disabled',
                'merchant',
                id,
                JSON.stringify({
                    domain: merchant.domain,
                    rate: enabled ? rate : null,
                    previous_enabled: merchant.cpc_billing_enabled,
                    previous_rate: merchant.cpc_rate
                })
            ]);
        } catch (auditError) {
            // Audit table might not exist yet - log to console
            console.warn('[CPC Billing] Audit log insert failed:', auditError.message);
        }

        res.json({
            success: true,
            merchant_id: id,
            domain: merchant.domain,
            cpc_billing: {
                enabled: updated.cpc_billing_enabled,
                enabled_at: updated.cpc_enabled_at,
                rate: updated.cpc_rate
            },
            message: enabled
                ? `CPC billing enabled at ${rate} per click. Only clicks after ${updated.cpc_enabled_at} will be billed.`
                : 'CPC billing disabled. Tracking continues but billing stopped.'
        });

    } catch (error) {
        console.error('[CPC Billing] Error:', error);
        res.status(500).json({
            error: 'Failed to update CPC billing settings'
        });
    }
});

// Helper: Trigger MCP reload
async function triggerMCPReload() {
    const mcpUrl = process.env.MCP_URL || 'http://mcp-server:8080';

    try {
        await axios.post(`${mcpUrl}/internal/reload`, {}, { timeout: 5000 });
    } catch (error) {
        console.error('MCP reload request failed:', error.message);
        // Don't throw, as this is not critical
    }
}

// Helper: Generate CPC recommendation message
function getRecommendationMessage(status, totalClicks, conversionRate) {
    switch (status) {
        case 'recommended':
            return `Strong performance: ${totalClicks} clicks with ${conversionRate}% conversion. CPC enablement recommended.`;
        case 'monitor':
            return `Moderate performance: ${totalClicks} clicks with ${conversionRate}% conversion. Consider monitoring before enablement.`;
        case 'not_recommended':
            return `Low conversion: ${totalClicks} clicks with ${conversionRate}% conversion. CPC enablement not recommended yet.`;
        case 'insufficient_data':
        default:
            return `Insufficient data: Only ${totalClicks} clicks recorded. Wait for more traffic before enabling CPC.`;
    }
}

// GET /admin/merchants/:id - Get detailed merchant info
router.get('/merchants/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await req.app.locals.db.query(`
            SELECT m.*, t.name as tenant_name, t.domain as tenant_domain,
                   mb.status as billing_status, mb.billing_mode,
                   mb.cpc_rate, mb.cpc_billing_enabled, mb.cpc_enabled_at,
                   (SELECT COUNT(*) FROM products WHERE merchant_id = m.id) as product_count,
                   (SELECT COUNT(DISTINCT mc.id) FROM merchant_categories mc WHERE mc.merchant_id = m.id) as category_count
            FROM merchants m
            JOIN tenants t ON m.tenant_id = t.id
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE m.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        res.json({ merchant: result.rows[0] });
    } catch (error) {
        console.error('Get merchant error:', error);
        res.status(500).json({ error: 'Failed to get merchant' });
    }
});

// PATCH /admin/merchants/:id - Update merchant settings
router.patch('/merchants/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { domain, admin_override } = req.body;

        const updates = [];
        const params = [id];
        let paramIndex = 2;

        if (domain !== undefined) {
            updates.push(`domain = $${paramIndex}`);
            params.push(domain.toLowerCase().trim());
            paramIndex++;
        }

        if (admin_override !== undefined) {
            updates.push(`admin_override = $${paramIndex}`);
            params.push(admin_override);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push('updated_at = NOW()');

        const query = `UPDATE merchants SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const result = await req.app.locals.db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'merchant_updated', 'merchant', id, { domain, admin_override });

        res.json({ merchant: result.rows[0] });
    } catch (error) {
        console.error('Update merchant error:', error);
        res.status(500).json({ error: 'Failed to update merchant' });
    }
});

// GET /admin/tenants - List all tenants
router.get('/tenants', requireAuth, async (req, res) => {
    try {
        const { search, status, limit = 20, page = 1 } = req.query;

        // Calculate offset from page
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        // Build WHERE clause
        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (search) {
            whereClause += ` AND (t.domain ILIKE $${paramIndex} OR t.name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (status) {
            whereClause += ` AND t.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM tenants t
            ${whereClause}
        `;
        const countResult = await req.app.locals.db.query(countQuery, params);
        const totalCount = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalCount / limitNum);

        // Get paginated data
        const dataQuery = `
            SELECT t.*,
                   COUNT(m.id) as merchants_count
            FROM tenants t
            LEFT JOIN merchants m ON m.tenant_id = t.id
            ${whereClause}
            GROUP BY t.id
            ORDER BY t.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limitNum, offset);

        const result = await req.app.locals.db.query(dataQuery, params);

        res.json({
            tenants: result.rows,
            count: result.rows.length,
            total: totalCount,
            page: pageNum,
            limit: limitNum,
            total_pages: totalPages
        });
    } catch (error) {
        console.error('List tenants error:', error);
        res.status(500).json({ error: 'Failed to list tenants' });
    }
});

// POST /admin/tenants - Create new tenant
router.post('/tenants', requireAuth, async (req, res) => {
    try {
        const { domain, name, status = 'active', branding = {} } = req.body;

        if (!domain || !name) {
            return res.status(400).json({ error: 'domain and name are required' });
        }

        const normalizedDomain = domain.toLowerCase().trim();

        // Validate
        if (name.length < 2 || name.length > 100) {
            return res.status(400).json({ error: 'Name must be 2-100 characters' });
        }

        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Check uniqueness
        const existing = await req.app.locals.db.query(
            'SELECT id FROM tenants WHERE domain = $1',
            [normalizedDomain]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Domain already exists' });
        }

        const result = await req.app.locals.db.query(`
            INSERT INTO tenants (domain, name, status, branding)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [normalizedDomain, name, status, JSON.stringify(branding)]);

        const tenant = result.rows[0];

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'tenant_created', 'tenant', tenant.id, { domain: normalizedDomain, name });

        res.status(201).json({ tenant });
    } catch (error) {
        console.error('Create tenant error:', error);
        res.status(500).json({ error: 'Failed to create tenant' });
    }
});

// GET /admin/tenants/:id - Get tenant details
router.get('/tenants/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await req.app.locals.db.query(`
            SELECT t.*,
                   COUNT(DISTINCT m.id) as merchant_count,
                   COUNT(DISTINCT p.id) as product_count,
                   COUNT(DISTINCT c.id) as category_count
            FROM tenants t
            LEFT JOIN merchants m ON m.tenant_id = t.id
            LEFT JOIN products p ON p.tenant_id = t.id
            LEFT JOIN categories c ON c.tenant_id = t.id
            WHERE t.id = $1
            GROUP BY t.id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json({ tenant: result.rows[0] });
    } catch (error) {
        console.error('Get tenant error:', error);
        res.status(500).json({ error: 'Failed to get tenant' });
    }
});

// PATCH /admin/tenants/:id - Update tenant
router.patch('/tenants/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status, branding } = req.body;

        const updates = [];
        const params = [id];
        let paramIndex = 2;

        if (name !== undefined) {
            if (name.length < 2 || name.length > 100) {
                return res.status(400).json({ error: 'Name must be 2-100 characters' });
            }
            updates.push(`name = $${paramIndex}`);
            params.push(name);
            paramIndex++;
        }

        if (status !== undefined) {
            if (!['active', 'suspended'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }
            updates.push(`status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        if (branding !== undefined) {
            updates.push(`branding = $${paramIndex}`);
            params.push(JSON.stringify(branding));
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push('updated_at = NOW()');

        const query = `UPDATE tenants SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const result = await req.app.locals.db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'tenant_updated', 'tenant', id, { name, status, branding });

        res.json({ tenant: result.rows[0] });
    } catch (error) {
        console.error('Update tenant error:', error);
        res.status(500).json({ error: 'Failed to update tenant' });
    }
});

// DELETE /admin/tenants/:id - Delete tenant

router.delete('/tenants/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Delete all merchants first (cascades to products, etc)
        await req.app.locals.db.query('DELETE FROM merchants WHERE tenant_id = $1', [id]);

        // Delete tenant
        const result = await req.app.locals.db.query('DELETE FROM tenants WHERE id = $1 RETURNING domain', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Log audit event
        if (req.admin?.id) {
            await logAuditEvent(req.app.locals.db, req.admin.id, 'tenant_deleted', 'tenant', id, { domain: result.rows[0].domain });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete tenant error:', error);
        res.status(500).json({ error: 'Failed to delete tenant', details: error.message });
    }
});








































// PATCH /admin/tenants/:id/status - Toggle tenant status
router.patch('/tenants/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const result = await req.app.locals.db.query(
            'UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Log audit event
        const action = status === 'active' ? 'tenant_activated' : 'tenant_suspended';
        await logAuditEvent(req.app.locals.db, req.admin.id, action, 'tenant', id, { status });

        res.json({ tenant: result.rows[0] });
    } catch (error) {
        console.error('Update tenant status error:', error);
        res.status(500).json({ error: 'Failed to update tenant status' });
    }
});

// ============================================================================
// CATEGORY MANAGEMENT
// ============================================================================

// GET /admin/categories - List all categories with product counts
router.get('/categories', requireAuth, async (req, res) => {
    try {
        const { tenant_id } = req.query;

        let query = `
            SELECT
                c.id, c.tenant_id, c.name, c.slug, c.parent_id,
                c.google_taxonomy_id, c.google_taxonomy_path,
                c.description, c.image_url, c.display_order, c.is_active,
                c.created_at, c.updated_at,
                t.name as tenant_name,
                COUNT(DISTINCT pc.product_id) as product_count,
                COUNT(DISTINCT p.merchant_id) as merchant_count
            FROM categories c
            LEFT JOIN tenants t ON c.tenant_id = t.id
            LEFT JOIN product_categories pc ON c.id = pc.category_id
            LEFT JOIN products p ON pc.product_id = p.id
        `;

        const params = [];
        if (tenant_id) {
            query += ` WHERE c.tenant_id = $1`;
            params.push(tenant_id);
        }

        query += `
            GROUP BY c.id, t.name
            ORDER BY c.tenant_id, c.display_order, c.name
        `;

        const result = await req.app.locals.db.query(query, params);
        res.json({ categories: result.rows });
    } catch (error) {
        console.error('List categories error:', error);
        res.status(500).json({ error: 'Failed to list categories' });
    }
});

// GET /admin/categories/:id - Get single category
router.get('/categories/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await req.app.locals.db.query(`
            SELECT
                c.*,
                t.name as tenant_name,
                COUNT(DISTINCT pc.product_id) as product_count
            FROM categories c
            LEFT JOIN tenants t ON c.tenant_id = t.id
            LEFT JOIN product_categories pc ON c.id = pc.category_id
            WHERE c.id = $1
            GROUP BY c.id, t.name
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ category: result.rows[0] });
    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({ error: 'Failed to get category' });
    }
});

// POST /admin/categories - Create category
router.post('/categories', requireAuth, async (req, res) => {
    try {
        const {
            tenant_id, name, slug, parent_id, google_taxonomy_id,
            google_taxonomy_path, description, image_url, display_order
        } = req.body;

        if (!tenant_id || !name) {
            return res.status(400).json({ error: 'tenant_id and name are required' });
        }

        const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const result = await req.app.locals.db.query(`
            INSERT INTO categories (
                tenant_id, name, slug, parent_id, google_taxonomy_id,
                google_taxonomy_path, description, image_url, display_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            tenant_id, name, categorySlug, parent_id || null,
            google_taxonomy_id || null, google_taxonomy_path || null,
            description || null, image_url || null, display_order || 0
        ]);

        await logAuditEvent(req.app.locals.db, req.admin.id, 'category_created', 'category', result.rows[0].id, { name });

        res.status(201).json({ category: result.rows[0] });
    } catch (error) {
        console.error('Create category error:', error);
        if (error.code === '23505') { // Unique violation
            res.status(400).json({ error: 'Category slug already exists for this tenant' });
        } else {
            res.status(500).json({ error: 'Failed to create category' });
        }
    }
});

// PUT /admin/categories/:id - Update category
router.put('/categories/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, slug, parent_id, google_taxonomy_id,
            google_taxonomy_path, description, image_url,
            display_order, is_active
        } = req.body;

        const result = await req.app.locals.db.query(`
            UPDATE categories
            SET
                name = COALESCE($1, name),
                slug = COALESCE($2, slug),
                parent_id = COALESCE($3, parent_id),
                google_taxonomy_id = COALESCE($4, google_taxonomy_id),
                google_taxonomy_path = COALESCE($5, google_taxonomy_path),
                description = COALESCE($6, description),
                image_url = COALESCE($7, image_url),
                display_order = COALESCE($8, display_order),
                is_active = COALESCE($9, is_active),
                updated_at = NOW()
            WHERE id = $10
            RETURNING *
        `, [
            name, slug, parent_id, google_taxonomy_id,
            google_taxonomy_path, description, image_url,
            display_order, is_active, id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        await logAuditEvent(req.app.locals.db, req.admin.id, 'category_updated', 'category', id, req.body);

        res.json({ category: result.rows[0] });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// DELETE /admin/categories/:id - Delete category
router.delete('/categories/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Check product count first
        const checkResult = await req.app.locals.db.query(`
            SELECT COUNT(*) as count
            FROM product_categories
            WHERE category_id = $1
        `, [id]);

        if (parseInt(checkResult.rows[0].count) > 0) {
            return res.status(400).json({
                error: 'Cannot delete category with linked products',
                product_count: parseInt(checkResult.rows[0].count)
            });
        }

        const result = await req.app.locals.db.query(`
            DELETE FROM categories
            WHERE id = $1
            RETURNING name
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        await logAuditEvent(req.app.locals.db, req.admin.id, 'category_deleted', 'category', id, {
            name: result.rows[0].name
        });

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// ============================================================================
// PRODUCT MANAGEMENT
// ============================================================================

// GET /admin/products - List all products with filters
router.get('/products', requireAuth, async (req, res) => {
    try {
        const { tenant_id, merchant_id, category_id, search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                p.id, p.external_id, p.name, p.description,
                p.price_cents, p.currency, p.image_url, p.stock_status,
                p.has_variations, p.indexed_at,
                m.domain as merchant_domain,
                m.id as merchant_id,
                t.name as tenant_name,
                p.tenant_id,
                ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories
            FROM products p
            JOIN merchants m ON p.merchant_id = m.id
            JOIN tenants t ON p.tenant_id = t.id
            LEFT JOIN product_categories pc ON p.id = pc.product_id
            LEFT JOIN categories c ON pc.category_id = c.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (tenant_id) {
            query += ` AND p.tenant_id = $${paramIndex}`;
            params.push(tenant_id);
            paramIndex++;
        }

        if (merchant_id) {
            query += ` AND p.merchant_id = $${paramIndex}`;
            params.push(merchant_id);
            paramIndex++;
        }

        if (category_id) {
            query += ` AND pc.category_id = $${paramIndex}`;
            params.push(category_id);
            paramIndex++;
        }

        if (search) {
            query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += `
            GROUP BY p.id, m.domain, m.id, t.name
            ORDER BY p.indexed_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        params.push(limit, offset);

        const result = await req.app.locals.db.query(query, params);

        // Get total count
        let countQuery = `
            SELECT COUNT(DISTINCT p.id) as total
            FROM products p
            LEFT JOIN product_categories pc ON p.id = pc.product_id
            WHERE 1=1
        `;

        const countParams = [];
        let countParamIndex = 1;

        if (tenant_id) {
            countQuery += ` AND p.tenant_id = $${countParamIndex}`;
            countParams.push(tenant_id);
            countParamIndex++;
        }

        if (merchant_id) {
            countQuery += ` AND p.merchant_id = $${countParamIndex}`;
            countParams.push(merchant_id);
            countParamIndex++;
        }

        if (category_id) {
            countQuery += ` AND pc.category_id = $${countParamIndex}`;
            countParams.push(category_id);
            countParamIndex++;
        }

        if (search) {
            countQuery += ` AND (p.name ILIKE $${countParamIndex} OR p.description ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
        }

        const countResult = await req.app.locals.db.query(countQuery, countParams);

        res.json({
            products: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].total),
                pages: Math.ceil(countResult.rows[0].total / limit)
            }
        });
    } catch (error) {
        console.error('List products error:', error);
        res.status(500).json({ error: 'Failed to list products' });
    }
});

// GET /admin/products/:id - Get single product
router.get('/products/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await req.app.locals.db.query(`
            SELECT
                p.*,
                m.domain as merchant_domain,
                t.name as tenant_name,
                ARRAY_AGG(
                    JSON_BUILD_OBJECT(
                        'id', c.id,
                        'name', c.name,
                        'slug', c.slug
                    )
                ) FILTER (WHERE c.id IS NOT NULL) as categories
            FROM products p
            JOIN merchants m ON p.merchant_id = m.id
            JOIN tenants t ON p.tenant_id = t.id
            LEFT JOIN product_categories pc ON p.id = pc.product_id
            LEFT JOIN categories c ON pc.category_id = c.id
            WHERE p.id = $1
            GROUP BY p.id, m.domain, t.name
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json({ product: result.rows[0] });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ error: 'Failed to get product' });
    }
});

// PUT /admin/products/:id - Update product
router.put('/products/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, description, price_cents, currency,
            stock_status, category_ids
        } = req.body;

        // Update product basic fields
        const result = await req.app.locals.db.query(`
            UPDATE products
            SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                price_cents = COALESCE($3, price_cents),
                currency = COALESCE($4, currency),
                stock_status = COALESCE($5, stock_status)
            WHERE id = $6
            RETURNING *
        `, [name, description, price_cents, currency, stock_status, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Update category associations if provided
        if (category_ids && Array.isArray(category_ids)) {
            // Remove existing associations
            await req.app.locals.db.query(`
                DELETE FROM product_categories
                WHERE product_id = $1
            `, [id]);

            // Add new associations
            for (const categoryId of category_ids) {
                await req.app.locals.db.query(`
                    INSERT INTO product_categories (product_id, category_id)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                `, [id, categoryId]);
            }
        }

        await logAuditEvent(req.app.locals.db, req.admin.id, 'product_updated', 'product', id, req.body);

        res.json({ product: result.rows[0] });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// DELETE /admin/products/:id - Delete product
router.delete('/products/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await req.app.locals.db.query(`
            DELETE FROM products
            WHERE id = $1
            RETURNING name
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        await logAuditEvent(req.app.locals.db, req.admin.id, 'product_deleted', 'product', id, {
            name: result.rows[0].name
        });

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// Helper function for audit logging
async function logAuditEvent(db, adminId, action, resourceType, resourceId, details = {}) {
    try {
        await db.query(`
            INSERT INTO audit_logs (admin_id, action, resource_type, resource_id, details, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [adminId, action, resourceType, resourceId, JSON.stringify(details)]);
    } catch (error) {
        console.warn('Audit log insert failed:', error.message);
    }
}

module.exports = router;
