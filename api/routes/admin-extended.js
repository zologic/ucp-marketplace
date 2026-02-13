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
router.get('/admins', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const result = await req.app.locals.db.query(`
            SELECT id, email, role, status, created_at, last_login
            FROM admins
            ORDER BY created_at DESC
        `);

        res.json({ users: result.rows });
    } catch (error) {
        console.error('List admins error:', error);
        res.status(500).json({ error: 'Failed to list admins' });
    }
});

// POST /admin/admins - Create admin user (superadmin only)
router.post('/admins', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { email, password, role = 'admin', status = 'active' } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        if (!['admin', 'superadmin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
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
            INSERT INTO admins (email, password_hash, role, status)
            VALUES ($1, $2, $3, $4)
            RETURNING id, email, role, status, created_at
        `, [normalizedEmail, passwordHash, role, status]);

        const admin = result.rows[0];

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'admin_created', 'admin', admin.id, { email: normalizedEmail, role, status });

        res.status(201).json({ admin });
    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({ error: 'Failed to create admin' });
    }
});

// GET /admin/admins/:id - Get admin details (superadmin only)
router.get('/admins/:id', requireAuth, requireSuperAdmin, async (req, res) => {
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

// PATCH /admin/admins/:id - Update admin user (superadmin only)
router.patch('/admins/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role, status, email } = req.body;

        // Build update fields dynamically
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (role) {
            if (!['admin', 'superadmin'].includes(role)) {
                return res.status(400).json({ error: 'Invalid role' });
            }
            // Cannot change own role
            if (req.admin.id === id) {
                return res.status(400).json({ error: 'Cannot change your own role' });
            }
            updates.push(`role = $${paramIndex++}`);
            values.push(role);
        }

        if (status) {
            if (!['active', 'inactive'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }
            updates.push(`status = $${paramIndex++}`);
            values.push(status);
        }

        if (email) {
            const normalizedEmail = email.toLowerCase().trim();
            updates.push(`email = $${paramIndex++}`);
            values.push(normalizedEmail);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        const result = await req.app.locals.db.query(
            `UPDATE admins SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, role, status, created_at`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        // Log audit event
        await logAuditEvent(req.app.locals.db, req.admin.id, 'admin_updated', 'admin', id, { role, status, email });

        res.json({ admin: result.rows[0] });
    } catch (error) {
        console.error('Update admin error:', error);
        res.status(500).json({ error: 'Failed to update admin' });
    }
});

// DELETE /admin/admins/:id - Delete admin (superadmin only)
router.delete('/admins/:id', requireAuth, requireSuperAdmin, async (req, res) => {
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
router.patch('/admins/:id/password', requireAuth, requireSuperAdmin, async (req, res) => {
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
        const {
            admin_user, // Frontend sends admin_user (admin ID)
            admin_id,
            action,
            resource_type,
            resource_id,
            entity_id, // Frontend sends entity_id as resource_id
            start_date,
            end_date,
            limit = 50,
            page = 1
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `
            SELECT al.*, a.email as admin_email
            FROM audit_logs al
            JOIN admins a ON al.admin_id = a.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        // Handle both admin_user (from frontend) and admin_id
        const adminIdValue = admin_user || admin_id;
        if (adminIdValue) {
            query += ` AND al.admin_id = $${paramIndex}`;
            params.push(adminIdValue);
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

        // Handle both entity_id (from frontend) and resource_id
        const resourceIdValue = entity_id || resource_id;
        if (resourceIdValue) {
            query += ` AND al.resource_id = $${paramIndex}`;
            params.push(resourceIdValue);
            paramIndex++;
        }

        if (start_date) {
            query += ` AND al.created_at >= $${paramIndex}`;
            params.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            // Add 1 day to include the full end date
            query += ` AND al.created_at < $${paramIndex}::date + interval '1 day'`;
            params.push(end_date);
            paramIndex++;
        }

        // Get total count for pagination
        const countQuery = query.replace('SELECT al.*, a.email as admin_email', 'SELECT COUNT(*)');
        const countResult = await req.app.locals.db.query(countQuery, params);
        const totalCount = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalCount / parseInt(limit));

        query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await req.app.locals.db.query(query, params);

        // Get list of admin users for filter dropdown
        const adminUsersResult = await req.app.locals.db.query(
            'SELECT id, email FROM admins ORDER BY email'
        );

        res.json({
            logs: result.rows,
            count: totalCount,
            total_pages: totalPages,
            admin_users: adminUsersResult.rows
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
        const startTime = Date.now();
        const health = {
            api: {
                status: 'healthy',
                response_time: 0,
                uptime_seconds: process.uptime(),
                version: process.env.npm_package_version || '1.0.0'
            },
            database: { status: 'unknown', connection_count: 0, size_bytes: 0, avg_query_time_ms: 0 },
            redis: { status: 'unknown', memory_used_bytes: 0, memory_peak_bytes: 0, connected_clients: 0, uptime_seconds: 0 },
            mcp_server: { status: 'unknown', merchants_count: 0, tenants_count: 0, last_sync: null },
            worker: { status: 'unknown', queue_depth: 0, jobs_processed_24h: 0, jobs_failed_24h: 0, next_crawl: null },
            metrics: {
                total_requests_24h: 0,
                avg_response_time_ms: 0,
                error_rate_percent: 0,
                search_queries_24h: 0
            },
            errors: [],
            system: {
                environment: process.env.NODE_ENV || 'development',
                node_version: process.version,
                platform: process.platform
            }
        };

        // Check database
        try {
            await req.app.locals.db.query('SELECT 1');
            const connResult = await req.app.locals.db.query('SELECT COUNT(*) FROM pg_stat_activity');
            const sizeResult = await req.app.locals.db.query('SELECT pg_database_size(current_database()) as size');
            health.database = {
                status: 'healthy',
                connection_count: parseInt(connResult.rows[0].count),
                size_bytes: parseInt(sizeResult.rows[0].size),
                avg_query_time_ms: 0
            };
        } catch (error) {
            health.database = { status: 'unhealthy', connection_count: 0, size_bytes: 0, avg_query_time_ms: 0 };
        }

        // Check Redis
        try {
            await req.app.locals.redis.ping();
            const info = await req.app.locals.redis.info();
            const memMatch = info.match(/used_memory:(\d+)/);
            const peakMatch = info.match(/used_memory_peak:(\d+)/);
            const clientsMatch = info.match(/connected_clients:(\d+)/);
            const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
            health.redis = {
                status: 'healthy',
                memory_used_bytes: memMatch ? parseInt(memMatch[1]) : 0,
                memory_peak_bytes: peakMatch ? parseInt(peakMatch[1]) : 0,
                connected_clients: clientsMatch ? parseInt(clientsMatch[1]) : 0,
                uptime_seconds: uptimeMatch ? parseInt(uptimeMatch[1]) : 0
            };
        } catch (error) {
            health.redis = { status: 'unhealthy', memory_used_bytes: 0, memory_peak_bytes: 0, connected_clients: 0, uptime_seconds: 0 };
        }

        // Check MCP server
        const mcpUrl = process.env.MCP_URL || 'http://mcp-server:8080';
        try {
            const axios = require('axios');
            await axios.get(`${mcpUrl}/internal/health`, { timeout: 2000 });
            const metricsResult = await req.app.locals.db.query(`
                SELECT
                    (SELECT COUNT(*) FROM merchants) as merchants_count,
                    (SELECT COUNT(*) FROM tenants) as tenants_count
            `);
            const metrics = metricsResult.rows[0];
            health.mcp_server = {
                status: 'healthy',
                merchants_count: parseInt(metrics.merchants_count),
                tenants_count: parseInt(metrics.tenants_count),
                last_sync: null
            };
        } catch (error) {
            console.error('MCP health check failed:', error.message);
            health.mcp_server = { status: 'unhealthy', merchants_count: 0, tenants_count: 0, last_sync: null };
        }

        // Worker status (check if worker is running in same process)
        if (global.workerStatus && global.workerStatus.running) {
            const uptimeSeconds = global.workerStatus.startedAt
                ? Math.floor((Date.now() - global.workerStatus.startedAt) / 1000)
                : 0;
            health.worker = {
                status: 'healthy',
                queue_depth: 0,
                jobs_processed_24h: 0,
                jobs_failed_24h: 0,
                next_crawl: null,
                uptime_seconds: uptimeSeconds
            };
        } else if (global.workerStatus && global.workerStatus.error) {
            health.worker = {
                status: 'unhealthy',
                queue_depth: 0,
                jobs_processed_24h: 0,
                jobs_failed_24h: 0,
                next_crawl: null,
                error: global.workerStatus.error
            };
        } else {
            health.worker = { status: 'not_running', queue_depth: 0, jobs_processed_24h: 0, jobs_failed_24h: 0, next_crawl: null };
        }

        // Metrics (24h)
        try {
            const metricsResult = await req.app.locals.db.query(`
                SELECT
                    (SELECT COUNT(*) FROM search_events WHERE created_at >= NOW() - INTERVAL '24 hours') as search_count
            `);
            health.metrics.search_queries_24h = parseInt(metricsResult.rows[0].search_count) || 0;
        } catch (error) {
            // Ignore metrics errors
        }

        // Recent errors (placeholder)
        health.errors = [];

        // Calculate API response time
        health.api.response_time = Date.now() - startTime;

        res.json(health);
    } catch (error) {
        console.error('System health error:', error);
        res.status(500).json({ error: 'Failed to get system health' });
    }
});

// GET /admin/analytics - Comprehensive platform analytics (matches frontend expectations)
router.get('/analytics', requireAuth, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;

        // Validate and build date filter
        let dateFilter = '';
        const params = [];
        let startDate, endDate;

        if (start_date && end_date) {
            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
                return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
            }

            // Validate date order
            if (new Date(start_date) > new Date(end_date)) {
                return res.status(400).json({ error: 'start_date must be before end_date' });
            }

            dateFilter = 'WHERE date BETWEEN $1 AND $2';
            params.push(start_date, end_date);
            startDate = start_date;
            endDate = end_date;
        } else if (period === 'day') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '1 day'";
            startDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            endDate = new Date().toISOString().split('T')[0];
        } else if (period === 'week') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '7 days'";
            startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
            endDate = new Date().toISOString().split('T')[0];
        } else if (period === 'month') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '30 days'";
            startDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
            endDate = new Date().toISOString().split('T')[0];
        }

        // 1. Aggregate metrics from daily stats (historical data)
        const metricsResult = await req.app.locals.db.query(`
            SELECT
                COALESCE(SUM(search_count), 0) as total_searches,
                COALESCE(SUM(click_count), 0) as total_clicks,
                COALESCE(SUM(checkout_count), 0) as total_checkouts,
                COALESCE(SUM(revenue_cents), 0) as total_revenue_cents
            FROM merchant_daily_stats
            ${dateFilter}
        `, params);

        // Add today's real-time data (not yet rolled up)
        const todayStr = new Date().toISOString().split('T')[0];
        const realtimeResult = await req.app.locals.db.query(`
            SELECT
                (SELECT COUNT(*) FROM search_events WHERE DATE(created_at) = $1) as search_count,
                (SELECT COUNT(*) FROM click_events WHERE DATE(created_at) = $1) as click_count,
                (SELECT COUNT(*) FROM checkout_sessions WHERE DATE(created_at) = $1 AND status != 'abandoned') as checkout_count,
                (SELECT COALESCE(SUM(revenue_cents), 0) FROM orders WHERE DATE(created_at) = $1) as revenue_cents
        `, [todayStr]);

        const metricsData = metricsResult.rows[0];
        const realtimeData = realtimeResult.rows[0];

        // Combine historical + today's real-time data
        const totalSearches = parseInt(metricsData.total_searches) + parseInt(realtimeData.search_count);
        const totalClicks = parseInt(metricsData.total_clicks) + parseInt(realtimeData.click_count);
        const totalCheckouts = parseInt(metricsData.total_checkouts) + parseInt(realtimeData.checkout_count);
        const totalRevenueCents = parseInt(metricsData.total_revenue_cents) + parseInt(realtimeData.revenue_cents);

        // Calculate CTR (avoid division by zero)
        const ctr = totalSearches > 0 ? (totalClicks / totalSearches) * 100 : 0;

        // 2. Get referral conversions
        const conversionsResult = await req.app.locals.db.query(`
            SELECT COUNT(*) as referral_conversions
            FROM orders
            WHERE referral_id IS NOT NULL
              AND created_at BETWEEN $1 AND $2
        `, [startDate, endDate]);

        const referralConversions = parseInt(conversionsResult.rows[0].referral_conversions);
        const conversionRate = totalSearches > 0 ? (referralConversions / totalSearches) * 100 : 0;

        // 2b. Get referral sources breakdown
        const referralSourcesResult = await req.app.locals.db.query(`
            SELECT
                referral_source,
                COUNT(*) as conversion_count,
                SUM(revenue_cents) as revenue_cents
            FROM orders
            WHERE referral_source IS NOT NULL
              AND created_at BETWEEN $1 AND $2
            GROUP BY referral_source
            ORDER BY conversion_count DESC
            LIMIT 10
        `, [startDate, endDate]);

        const referralSources = referralSourcesResult.rows;

        // 3. Trends data (dates and searches arrays)
        const trendsResult = await req.app.locals.db.query(`
            SELECT date,
                   COALESCE(SUM(search_count), 0) as searches
            FROM merchant_daily_stats
            ${dateFilter}
            GROUP BY date
            ORDER BY date ASC
        `, params);

        const trends = {
            dates: trendsResult.rows.map(row => row.date),
            searches: trendsResult.rows.map(row => parseInt(row.searches))
        };

        // 4. Revenue by tenant
        const revenueByTenantResult = await req.app.locals.db.query(`
            SELECT
                t.id as tenant_id,
                t.name as tenant_name,
                COALESCE(SUM(mds.revenue_cents), 0) as revenue_cents
            FROM tenants t
            LEFT JOIN merchants m ON t.id = m.tenant_id
            LEFT JOIN merchant_daily_stats mds ON m.id = mds.merchant_id
            ${dateFilter ? 'WHERE mds.' + dateFilter.substring(6) : ''}
            GROUP BY t.id, t.name
            HAVING SUM(mds.revenue_cents) > 0
            ORDER BY revenue_cents DESC
            LIMIT 10
        `, params);

        // 5. Commission by tenant (5% commission rate)
        const commissionByTenant = revenueByTenantResult.rows.map(row => ({
            tenant_id: row.tenant_id,
            tenant_name: row.tenant_name,
            commission_cents: Math.round(parseInt(row.revenue_cents) * 0.05)
        }));

        // 6. Top merchants (reuse logic from overview endpoint)
        const topMerchantsResult = await req.app.locals.db.query(`
            SELECT m.id, m.domain,
                   COALESCE(SUM(mds.revenue_cents), 0) as revenue_cents,
                   COALESCE(SUM(mds.order_count), 0) as order_count
            FROM merchants m
            LEFT JOIN merchant_daily_stats mds ON m.id = mds.merchant_id
            ${dateFilter ? 'WHERE mds.' + dateFilter.substring(6) : ''}
            GROUP BY m.id, m.domain
            HAVING SUM(mds.revenue_cents) > 0
            ORDER BY revenue_cents DESC
            LIMIT 10
        `, params);

        // 7. Top products by search count
        const topProductsResult = await req.app.locals.db.query(`
            SELECT
                p.id as product_id,
                p.name,
                COUNT(DISTINCT se.id) as search_count,
                COUNT(DISTINCT ce.id) as click_count
            FROM products p
            LEFT JOIN search_events se ON p.id = se.product_id
              AND se.created_at BETWEEN $1 AND $2
            LEFT JOIN click_events ce ON p.id = ce.product_id
              AND ce.created_at BETWEEN $1 AND $2
            WHERE se.id IS NOT NULL OR ce.id IS NOT NULL
            GROUP BY p.id, p.name
            ORDER BY search_count DESC
            LIMIT 10
        `, [startDate, endDate]);

        // Format response to match frontend expectations
        res.json({
            metrics: {
                total_searches: totalSearches,
                total_clicks: totalClicks,
                ctr: parseFloat(ctr.toFixed(2)),
                total_checkouts: totalCheckouts,
                referral_conversions: referralConversions,
                conversion_rate: parseFloat(conversionRate.toFixed(2)),
                total_revenue_cents: totalRevenueCents
            },
            trends: trends,
            revenue_by_tenant: revenueByTenantResult.rows.map(row => ({
                tenant_id: row.tenant_id,
                tenant_name: row.tenant_name,
                revenue_cents: parseInt(row.revenue_cents)
            })),
            commission_by_tenant: commissionByTenant,
            top_merchants: topMerchantsResult.rows.map(row => ({
                id: row.id,
                domain: row.domain,
                revenue_cents: parseInt(row.revenue_cents),
                order_count: parseInt(row.order_count)
            })),
            top_products: topProductsResult.rows.map(row => ({
                product_id: row.product_id,
                name: row.name,
                search_count: parseInt(row.search_count),
                click_count: parseInt(row.click_count)
            })),
            referral_sources: referralSources
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

// GET /admin/analytics/export - Export analytics as CSV
router.get('/analytics/export', requireAuth, async (req, res) => {
    try {
        const { period = 'month', start_date, end_date } = req.query;

        // Validate and build date filter
        let dateFilter = '';
        const params = [];
        let startDate, endDate;

        if (start_date && end_date) {
            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
                return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
            }

            // Validate date order
            if (new Date(start_date) > new Date(end_date)) {
                return res.status(400).json({ error: 'start_date must be before end_date' });
            }

            dateFilter = 'WHERE date BETWEEN $1 AND $2';
            params.push(start_date, end_date);
            startDate = start_date;
            endDate = end_date;
        } else if (period === 'day') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '1 day'";
            startDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            endDate = new Date().toISOString().split('T')[0];
        } else if (period === 'week') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '7 days'";
            startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
            endDate = new Date().toISOString().split('T')[0];
        } else if (period === 'month') {
            dateFilter = "WHERE date >= CURRENT_DATE - INTERVAL '30 days'";
            startDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
            endDate = new Date().toISOString().split('T')[0];
        }

        // Query daily aggregated data
        const dailyResult = await req.app.locals.db.query(`
            SELECT
                date,
                COALESCE(SUM(search_count), 0) as searches,
                COALESCE(SUM(click_count), 0) as clicks,
                CASE
                    WHEN SUM(search_count) > 0
                    THEN (SUM(click_count)::float / SUM(search_count) * 100)
                    ELSE 0
                END as ctr,
                COALESCE(SUM(checkout_count), 0) as checkouts,
                COALESCE(SUM(revenue_cents), 0) / 100.0 as revenue_eur
            FROM merchant_daily_stats
            ${dateFilter}
            GROUP BY date
            ORDER BY date
        `, params);

        // Build CSV content
        let csv = 'Date,Searches,Clicks,CTR %,Checkouts,Revenue (EUR)\n';

        for (const row of dailyResult.rows) {
            csv += `${row.date},${row.searches},${row.clicks},${parseFloat(row.ctr).toFixed(2)},${row.checkouts},${parseFloat(row.revenue_eur).toFixed(2)}\n`;
        }

        // Set response headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-export-${startDate}-${endDate}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Analytics export error:', error);
        res.status(500).json({ error: 'Failed to export analytics' });
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
            LEFT JOIN merchant_daily_stats mds ON m.id = mds.merchant_id ${params.length > 0 ? 'AND mds.date >= $1 AND mds.date <= $2' : ''}
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
