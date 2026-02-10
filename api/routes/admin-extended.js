/**
 * Extended Admin API Routes
 * Additional dashboard management endpoints (admin users, invoices, audit logs, system health)
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

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

// ======================
// ADMIN USER MANAGEMENT
// ======================

// GET /admin/admins - List admin users (superadmin only)
router.get('/admins', requireSuperAdmin, async (req, res) => {
    try {
        const result = await req.app.locals.db.query(`
            SELECT id, email, role, created_at
            FROM admins
            ORDER BY created_at DESC
        `);

        res.json({ admins: result.rows });
    } catch (error) {
        console.error('List admins error:', error);
        res.status(500).json({ error: 'Failed to list admins' });
    }
});

// POST /admin/admins - Create admin user (superadmin only)
router.post('/admins', requireSuperAdmin, async (req, res) => {
    try {
        const { email, password, role = 'admin' } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        if (!['admin', 'superadmin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check uniqueness
        const existing = await req.app.locals.db.query(
            'SELECT id FROM admins WHERE email = $1',
            [normalizedEmail]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        const result = await req.app.locals.db.query(`
            INSERT INTO admins (email, password_hash, role)
            VALUES ($1, $2, $3)
            RETURNING id, email, role, created_at
        `, [normalizedEmail, passwordHash, role]);

        const admin = result.rows[0];

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'admin_created', 'admin', admin.id, { email: normalizedEmail, role });

        res.status(201).json({ admin });
    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({ error: 'Failed to create admin' });
    }
});

// GET /admin/admins/:id - Get admin details (superadmin only)
router.get('/admins/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await req.app.locals.db.query(
            'SELECT id, email, role, created_at FROM admins WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        res.json({ admin: result.rows[0] });
    } catch (error) {
        console.error('Get admin error:', error);
        res.status(500).json({ error: 'Failed to get admin' });
    }
});

// PATCH /admin/admins/:id - Update admin role (superadmin only)
router.patch('/admins/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!['admin', 'superadmin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Cannot change own role
        if (req.admin.id === id) {
            return res.status(400).json({ error: 'Cannot change your own role' });
        }

        const result = await req.app.locals.db.query(
            'UPDATE admins SET role = $1 WHERE id = $2 RETURNING id, email, role, created_at',
            [role, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'admin_role_changed', 'admin', id, { new_role: role });

        res.json({ admin: result.rows[0] });
    } catch (error) {
        console.error('Update admin error:', error);
        res.status(500).json({ error: 'Failed to update admin' });
    }
});

// DELETE /admin/admins/:id - Delete admin (superadmin only)
router.delete('/admins/:id', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Cannot delete self
        if (req.admin.id === id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        const result = await req.app.locals.db.query(
            'DELETE FROM admins WHERE id = $1 RETURNING email',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'admin_deleted', 'admin', id, { email: result.rows[0].email });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete admin error:', error);
        res.status(500).json({ error: 'Failed to delete admin' });
    }
});

// PATCH /admin/admins/:id/password - Change admin password (superadmin only)
router.patch('/admins/:id/password', requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { password, confirm_password } = req.body;

        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        if (password !== confirm_password) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        const result = await req.app.locals.db.query(
            'UPDATE admins SET password_hash = $1 WHERE id = $2 RETURNING id',
            [passwordHash, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'admin_password_changed', 'admin', id, {});

        res.json({ success: true });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// ====================
// INVOICE & BILLING
// ====================

// GET /admin/invoices - List all invoices
router.get('/invoices', requireAuth, async (req, res) => {
    try {
        const { search, status, start_date, end_date, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT i.*, m.domain as merchant_domain, t.name as tenant_name
            FROM invoices i
            JOIN merchants m ON i.merchant_id = m.id
            JOIN tenants t ON i.tenant_id = t.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (i.invoice_number ILIKE $${paramIndex} OR m.domain ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (status) {
            query += ` AND i.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (start_date) {
            query += ` AND i.issued_at >= $${paramIndex}`;
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            query += ` AND i.issued_at <= $${paramIndex}`;
            params.push(end_date);
            paramIndex++;
        }

        query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await req.app.locals.db.query(query, params);

        res.json({
            invoices: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('List invoices error:', error);
        res.status(500).json({ error: 'Failed to list invoices' });
    }
});

// GET /admin/invoices/:id - Get invoice details
router.get('/invoices/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const invoiceResult = await req.app.locals.db.query(`
            SELECT i.*, m.domain as merchant_domain, m.id as merchant_id, t.name as tenant_name
            FROM invoices i
            JOIN merchants m ON i.merchant_id = m.id
            JOIN tenants t ON i.tenant_id = t.id
            WHERE i.id = $1
        `, [id]);

        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = invoiceResult.rows[0];

        // Get invoice items
        const itemsResult = await req.app.locals.db.query(
            'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at',
            [id]
        );

        res.json({
            invoice,
            items: itemsResult.rows
        });
    } catch (error) {
        console.error('Get invoice error:', error);
        res.status(500).json({ error: 'Failed to get invoice' });
    }
});

// GET /admin/merchants/:id/invoices - List merchant invoices
router.get('/merchants/:id/invoices', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await req.app.locals.db.query(
            'SELECT * FROM invoices WHERE merchant_id = $1 ORDER BY created_at DESC',
            [id]
        );

        res.json({ invoices: result.rows });
    } catch (error) {
        console.error('List merchant invoices error:', error);
        res.status(500).json({ error: 'Failed to list merchant invoices' });
    }
});

// PATCH /admin/invoices/:id/status - Update invoice status
router.patch('/invoices/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['paid', 'overdue'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const updates = ['status = $1'];
        const params = [status, id];

        if (status === 'paid') {
            updates.push('paid_at = NOW()');
        }

        const query = `UPDATE invoices SET ${updates.join(', ')} WHERE id = $2 RETURNING *`;
        const result = await req.app.locals.db.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'invoice_status_changed', 'invoice', id, { status });

        res.json({ invoice: result.rows[0] });
    } catch (error) {
        console.error('Update invoice status error:', error);
        res.status(500).json({ error: 'Failed to update invoice status' });
    }
});

// ====================
// AUDIT LOGS
// ====================

// GET /admin/audit-logs - Query audit logs
router.get('/audit-logs', requireAuth, async (req, res) => {
    try {
        const { admin_id, action, resource_type, resource_id, start_date, end_date, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT al.*, a.email as admin_email
            FROM audit_logs al
            JOIN admins a ON al.admin_id = a.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (admin_id) {
            query += ` AND al.admin_id = $${paramIndex}`;
            params.push(admin_id);
            paramIndex++;
        }

        if (action) {
            query += ` AND al.action = $${paramIndex}`;
            params.push(action);
            paramIndex++;
        }

        if (resource_type) {
            query += ` AND al.resource_type = $${paramIndex}`;
            params.push(resource_type);
            paramIndex++;
        }

        if (resource_id) {
            query += ` AND al.resource_id = $${paramIndex}`;
            params.push(resource_id);
            paramIndex++;
        }

        if (start_date) {
            query += ` AND al.created_at >= $${paramIndex}`;
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            query += ` AND al.created_at <= $${paramIndex}`;
            params.push(end_date);
            paramIndex++;
        }

        query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await req.app.locals.db.query(query, params);

        res.json({
            logs: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('List audit logs error:', error);
        res.status(500).json({ error: 'Failed to list audit logs' });
    }
});

// ====================
// SYSTEM HEALTH & METRICS
// ====================

// GET /admin/dashboard/stats - Dashboard summary statistics
router.get('/dashboard/stats', requireAuth, async (req, res) => {
    try {
        // Active merchants count
        const merchantsResult = await req.app.locals.db.query(
            "SELECT COUNT(*) as count FROM merchants WHERE status = 'active'"
        );

        // Total tenants count
        const tenantsResult = await req.app.locals.db.query(
            "SELECT COUNT(*) as count FROM tenants WHERE status = 'active'"
        );

        // Month-to-date revenue
        const revenueResult = await req.app.locals.db.query(`
            SELECT COALESCE(SUM(revenue_cents), 0) as sum
            FROM merchant_daily_stats
            WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
        `);

        // Searches today
        const searchesResult = await req.app.locals.db.query(`
            SELECT COALESCE(SUM(search_count), 0) as sum
            FROM merchant_daily_stats
            WHERE date = CURRENT_DATE
        `);

        // Orders today
        const ordersResult = await req.app.locals.db.query(`
            SELECT COALESCE(SUM(order_count), 0) as sum
            FROM merchant_daily_stats
            WHERE date = CURRENT_DATE
        `);

        res.json({
            active_merchants: parseInt(merchantsResult.rows[0].count),
            total_tenants: parseInt(tenantsResult.rows[0].count),
            revenue_mtd_cents: parseInt(revenueResult.rows[0].sum),
            searches_today: parseInt(searchesResult.rows[0].sum),
            orders_today: parseInt(ordersResult.rows[0].sum)
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
});

// GET /admin/system/health - System health check
router.get('/system/health', requireAuth, async (req, res) => {
    try {
        const health = {
            services: {
                database: { status: 'unknown' },
                redis: { status: 'unknown' },
                mcp_server: { status: 'unknown' },
                worker: { status: 'unknown' }
            },
            metrics: {
                total_merchants: 0,
                total_tenants: 0,
                total_products: 0,
                db_size_bytes: 0
            }
        };

        // Check database
        try {
            await req.app.locals.db.query('SELECT 1');
            const connResult = await req.app.locals.db.query('SELECT COUNT(*) FROM pg_stat_activity');
            health.services.database = {
                status: 'healthy',
                connections: parseInt(connResult.rows[0].count)
            };
        } catch (error) {
            health.services.database = { status: 'unhealthy' };
        }

        // Check Redis
        try {
            await req.app.locals.redis.ping();
            const info = await req.app.locals.redis.info('memory');
            const memMatch = info.match(/used_memory:(\d+)/);
            health.services.redis = {
                status: 'healthy',
                memory_used_bytes: memMatch ? parseInt(memMatch[1]) : 0
            };
        } catch (error) {
            health.services.redis = { status: 'unhealthy' };
        }

        // Check MCP server (optional)
        const mcpUrl = process.env.MCP_URL || 'http://mcp-server:8080';
        try {
            const axios = require('axios');
            await axios.get(`${mcpUrl}/health`, { timeout: 2000 });
            health.services.mcp_server = { status: 'healthy' };
        } catch (error) {
            health.services.mcp_server = { status: 'unknown' };
        }

        // Worker status (always unknown unless we implement health endpoint)
        health.services.worker = { status: 'unknown' };

        // Fetch metrics
        const metricsResult = await req.app.locals.db.query(`
            SELECT
                (SELECT COUNT(*) FROM merchants) as total_merchants,
                (SELECT COUNT(*) FROM tenants) as total_tenants,
                (SELECT COUNT(*) FROM products) as total_products,
                (SELECT pg_database_size(current_database())) as db_size_bytes
        `);

        const metrics = metricsResult.rows[0];
        health.metrics = {
            total_merchants: parseInt(metrics.total_merchants),
            total_tenants: parseInt(metrics.total_tenants),
            total_products: parseInt(metrics.total_products),
            db_size_bytes: parseInt(metrics.db_size_bytes)
        };

        res.json(health);
    } catch (error) {
        console.error('System health error:', error);
        res.status(500).json({ error: 'Failed to get system health' });
    }
});

// GET /admin/analytics/overview - Platform-wide analytics
router.get('/analytics/overview', requireAuth, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;

        let dateFilter = '';
        const params = [];

        if (start_date && end_date) {
            dateFilter = 'WHERE date BETWEEN $1 AND $2';
            params.push(start_date, end_date);
        } else if (period === 'day') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '1 day'";
        } else if (period === 'week') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '7 days'";
        } else if (period === 'month') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '30 days'";
        }

        // Aggregate stats
        const statsResult = await req.app.locals.db.query(`
            SELECT
                COALESCE(SUM(search_count), 0) as total_searches,
                COALESCE(SUM(click_count), 0) as total_clicks,
                COALESCE(SUM(order_count), 0) as total_orders,
                COALESCE(SUM(revenue_cents), 0) as total_revenue_cents
            FROM merchant_daily_stats
            ${dateFilter}
        `, params);

        const stats = statsResult.rows[0];

        // Top merchants by revenue
        const topMerchantsResult = await req.app.locals.db.query(`
            SELECT m.id, m.domain,
                   COALESCE(SUM(mds.revenue_cents), 0) as revenue_cents,
                   COALESCE(SUM(mds.order_count), 0) as order_count
            FROM merchants m
            LEFT JOIN merchant_daily_stats mds ON m.id = mds.merchant_id ${dateFilter ? 'AND mds.date >= $1 AND mds.date <= $2' : ''}
            GROUP BY m.id, m.domain
            ORDER BY revenue_cents DESC
            LIMIT 10
        `, params);

        // Daily time series (last 30 days)
        const dailyResult = await req.app.locals.db.query(`
            SELECT date,
                   COALESCE(SUM(search_count), 0) as searches,
                   COALESCE(SUM(revenue_cents), 0) as revenue
            FROM merchant_daily_stats
            ${dateFilter}
            GROUP BY date
            ORDER BY date
        `, params);

        res.json({
            summary: {
                total_searches: parseInt(stats.total_searches),
                total_clicks: parseInt(stats.total_clicks),
                total_orders: parseInt(stats.total_orders),
                total_revenue_cents: parseInt(stats.total_revenue_cents)
            },
            top_merchants: topMerchantsResult.rows,
            daily_data: dailyResult.rows
        });
    } catch (error) {
        console.error('Analytics overview error:', error);
        res.status(500).json({ error: 'Failed to get analytics overview' });
    }
});

module.exports = router;
