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

        // Verify password
        const isValid = await bcrypt.compare(password, admin.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

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
        const { domain, tenant_id, auto_verify = true } = req.body;

        if (!domain || !tenant_id) {
            return res.status(400).json({ error: 'domain and tenant_id required' });
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

        // Auto-verify if requested
        if (auto_verify) {
            // Trigger verification asynchronously (don't wait)
            verifyMerchantUCP(merchant.id, req.app.locals.db).catch(err => {
                console.error('Auto-verify failed:', err);
            });
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

        if (merchant.status !== 'verified') {
            return res.status(400).json({ error: 'Merchant must be verified first' });
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
    const ucpEndpoint = `${merchant.domain}/.well-known/ucp`;

    try {
        // Fetch UCP manifest
        const response = await axios.get(ucpEndpoint, { timeout: 10000 });
        const manifest = response.data;

        // Validate structure
        if (!manifest.products_endpoint || !manifest.checkout_endpoint || !manifest.public_key) {
            await db.query(
                'UPDATE merchants SET status = $1, last_verified_at = NOW() WHERE id = $2',
                ['pending', merchantId]
            );

            return {
                status: 'failed',
                error: 'Invalid UCP manifest structure'
            };
        }

        // Update merchant with UCP info
        await db.query(`
            UPDATE merchants
            SET ucp_endpoint = $1, public_key = $2, status = $3, last_verified_at = NOW()
            WHERE id = $4
        `, [ucpEndpoint, manifest.public_key, 'verified', merchantId]);

        return {
            status: 'verified',
            ucp_endpoint: ucpEndpoint,
            public_key: manifest.public_key,
            verified_at: new Date().toISOString()
        };
    } catch (error) {
        console.error('UCP verification failed:', error.message);

        await db.query(
            'UPDATE merchants SET last_verified_at = NOW() WHERE id = $1',
            [merchantId]
        );

        return {
            status: 'failed',
            error: error.message
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
                   mb.cpc_rate, mb.cpc_billing_enabled, mb.cpc_enabled_at
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
                   COUNT(m.id) as merchant_count
            FROM tenants t
            LEFT JOIN merchants m ON m.tenant_id = t.id
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
router.delete('/tenants/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check for merchants
        const merchantCheck = await req.app.locals.db.query(
            'SELECT COUNT(*) as count FROM merchants WHERE tenant_id = $1',
            [id]
        );

        if (parseInt(merchantCheck.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Cannot delete tenant with active merchants' });
        }

        const result = await req.app.locals.db.query(
            'DELETE FROM tenants WHERE id = $1 RETURNING domain',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'tenant_deleted', 'tenant', id, { domain: result.rows[0].domain });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete tenant error:', error);
        res.status(500).json({ error: 'Failed to delete tenant' });
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
