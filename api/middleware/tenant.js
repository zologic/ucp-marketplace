/**
 * Tenant Resolution Middleware
 * Resolves tenant from Host header for multi-domain white-label support
 */

async function resolveTenant(req, res, next) {
    try {
        const host = req.headers.host;

        if (!host) {
            return res.status(400).json({ error: 'Host header required' });
        }

        // Extract domain (remove port if present)
        const domain = host.split(':')[0];

        // Query tenant from database
        const result = await req.app.locals.db.query(
            'SELECT * FROM tenants WHERE domain = $1 AND status = $2',
            [domain, 'active']
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Attach tenant to request
        req.tenant = result.rows[0];
        next();
    } catch (error) {
        console.error('Tenant resolution error:', error);
        res.status(500).json({ error: 'Failed to resolve tenant' });
    }
}

module.exports = { resolveTenant };
