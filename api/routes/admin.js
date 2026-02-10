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
        const { tenant_id, status, search, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT m.*, t.name as tenant_name, t.domain as tenant_domain,
                   mb.status as billing_status, mb.billing_mode
            FROM merchants m
            JOIN tenants t ON m.tenant_id = t.id
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (tenant_id) {
            query += ` AND m.tenant_id = $${paramIndex}`;
            params.push(tenant_id);
            paramIndex++;
        }

        if (status) {
            query += ` AND m.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (search) {
            query += ` AND m.domain ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await req.app.locals.db.query(query, params);

        res.json({
            merchants: result.rows,
            count: result.rows.length
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

module.exports = router;
