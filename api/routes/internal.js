/**
 * Internal API Routes
 * Service-to-service communication (NOT publicly exposed)
 */

const express = require('express');
const router = express.Router();

// GET /internal/active-merchants - Get active merchants for MCP server
router.get('/active-merchants', async (req, res) => {
    try {
        const { tenant_id } = req.query;

        if (!tenant_id) {
            return res.status(400).json({ error: 'tenant_id required' });
        }

        // Query active merchants for tenant
        const result = await req.app.locals.db.query(`
            SELECT m.id,
                   m.domain,
                   m.ucp_endpoint,
                   m.public_key,
                   m.signing_key_id,
                   m.service_base_url,
                   m.business_name,
                   m.business_url,
                   mb.status as billing_status
            FROM merchants m
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE m.tenant_id = $1
              AND m.status = 'active'
              AND (mb.status != 'suspended' OR m.admin_override = true)
            ORDER BY m.created_at DESC
        `, [tenant_id]);

        res.json({
            merchants: result.rows,
            count: result.rows.length,
            cached_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get active merchants error:', error);
        res.status(500).json({ error: 'Failed to get merchants' });
    }
});

// GET /internal/tenant-by-domain - Resolve tenant by domain
router.get('/tenant-by-domain', async (req, res) => {
    try {
        const { domain } = req.query;

        if (!domain) {
            return res.status(400).json({ error: 'domain required' });
        }

        const result = await req.app.locals.db.query(
            'SELECT * FROM tenants WHERE domain = $1 AND status = $2',
            [domain, 'active']
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json({ tenant: result.rows[0] });
    } catch (error) {
        console.error('Get tenant error:', error);
        res.status(500).json({ error: 'Failed to get tenant' });
    }
});

module.exports = router;
