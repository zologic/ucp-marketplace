/**
 * Sitemap Generation Job
 * Generates sitemaps for all active tenants
 * Run: Daily at 03:00 UTC (after product indexing)
 */

/**
 * Generate sitemaps for all tenants
 * @param {Object} db - PostgreSQL pool
 */
async function generateSitemaps(db) {
    const startTime = Date.now();
    console.log('[Sitemap Generation] Job started');

    try {
        // Fetch all active tenants
        const tenantsResult = await db.query(`
            SELECT id, domain, name
            FROM tenants
            WHERE status = 'active'
            ORDER BY domain
        `);

        const tenants = tenantsResult.rows;
        console.log(`[Sitemap Generation] Processing ${tenants.length} tenant(s)`);

        for (const tenant of tenants) {
            try {
                await generateTenantSitemaps(db, tenant);
            } catch (error) {
                console.error(`[Sitemap Generation] Failed for tenant ${tenant.domain}:`, error.message);
                // Continue with next tenant
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[Sitemap Generation] Job completed in ${duration}s`);

        return {
            success: true,
            tenants_processed: tenants.length,
            duration_seconds: duration
        };

    } catch (error) {
        console.error('[Sitemap Generation] Job failed:', error);
        throw error;
    }
}

/**
 * Generate sitemaps for a specific tenant
 * @param {Object} db - PostgreSQL pool
 * @param {Object} tenant - Tenant object
 */
async function generateTenantSitemaps(db, tenant) {
    console.log(`[Sitemap Generation] Generating for ${tenant.domain}`);

    const MIN_PRODUCTS_PER_CATEGORY = parseInt(process.env.MIN_PRODUCTS_PER_CATEGORY) || 5;
    const MIN_PRODUCTS_PER_BRAND = parseInt(process.env.MIN_PRODUCTS_PER_BRAND) || 3;

    // Count categories that meet threshold
    const categoriesResult = await db.query(`
        SELECT COUNT(DISTINCT p.category) as category_count
        FROM products p
        JOIN merchants m ON p.merchant_id = m.id
        WHERE p.tenant_id = $1
          AND p.category IS NOT NULL
          AND p.category != ''
          AND m.status = 'active'
          AND p.stock_status = 'in_stock'
        HAVING COUNT(*) >= $2
    `, [tenant.id, MIN_PRODUCTS_PER_CATEGORY]);

    const categoryCount = categoriesResult.rows[0]?.category_count || 0;

    // Count brands that meet threshold
    const brandsResult = await db.query(`
        SELECT COUNT(*) as brand_count
        FROM (
            SELECT p.brand
            FROM products p
            JOIN merchants m ON p.merchant_id = m.id
            WHERE p.tenant_id = $1
              AND p.brand IS NOT NULL
              AND p.brand != ''
              AND m.status = 'active'
              AND p.stock_status = 'in_stock'
            GROUP BY p.brand
            HAVING COUNT(DISTINCT p.merchant_id) >= 2 AND COUNT(*) >= $2
        ) brands
    `, [tenant.id, MIN_PRODUCTS_PER_BRAND]);

    const brandCount = brandsResult.rows[0]?.brand_count || 0;

    // Store sitemap metadata (optional - for monitoring/analytics)
    // This could be stored in a sitemaps table if needed
    console.log(`[Sitemap Generation] ${tenant.domain}: ${categoryCount} categories, ${brandCount} brands`);

    return {
        tenant_id: tenant.id,
        domain: tenant.domain,
        categories: categoryCount,
        brands: brandCount,
        generated_at: new Date().toISOString()
    };
}

module.exports = {
    generateSitemaps
};
