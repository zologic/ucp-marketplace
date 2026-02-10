/**
 * SEO Routes
 * robots.txt and sitemap endpoints (tenant-aware)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// GET /robots.txt - Serve tenant-specific robots.txt
router.get('/robots.txt', async (req, res) => {
    try {
        const domain = req.get('host') || 'localhost';

        // Generate robots.txt dynamically
        const robotsTxt = `User-agent: *
# Allow core site
Allow: /

# Block internal APIs
Disallow: /api/
Disallow: /admin/
Disallow: /internal/
Disallow: /mcp/
Disallow: /worker/

# Block raw search endpoints
Disallow: /search?
Disallow: /*?q=
Disallow: /*&

# Allow SEO-friendly search routes (future)
Allow: /buy/
Allow: /category/
Allow: /brand/

# Block user/session artifacts
Disallow: /session/
Disallow: /checkout/
Disallow: /redirect/

# Block files
Disallow: /*.json$
Disallow: /*.xml$

# Sitemap
Sitemap: https://${domain}/sitemap-index.xml
`;

        res.type('text/plain');
        res.send(robotsTxt);
    } catch (error) {
        console.error('Error serving robots.txt:', error);
        res.status(500).send('User-agent: *\nDisallow: /');
    }
});

// GET /sitemap-index.xml - Serve sitemap index
router.get('/sitemap-index.xml', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const domain = req.get('host') || 'localhost';
        const protocol = req.secure ? 'https' : 'http';

        // Generate sitemap index XML
        const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${protocol}://${domain}/sitemaps/categories.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${protocol}://${domain}/sitemaps/brands.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${protocol}://${domain}/sitemaps/buy-pages.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>
</sitemapindex>`;

        res.type('application/xml');
        res.send(sitemapIndex);
    } catch (error) {
        console.error('Error serving sitemap index:', error);
        res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>');
    }
});

// GET /sitemaps/categories.xml - Serve categories sitemap
router.get('/sitemaps/categories.xml', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const domain = req.get('host') || 'localhost';
        const protocol = req.secure ? 'https' : 'http';

        // Fetch categories with ≥ MIN_PRODUCTS_PER_CATEGORY active products
        const MIN_PRODUCTS_PER_CATEGORY = parseInt(process.env.MIN_PRODUCTS_PER_CATEGORY) || 5;

        const categoriesResult = await req.app.locals.db.query(`
            SELECT p.category, COUNT(*) as product_count, MAX(p.indexed_at) as last_updated
            FROM products p
            JOIN merchants m ON p.merchant_id = m.id
            WHERE p.tenant_id = $1
              AND p.category IS NOT NULL
              AND p.category != ''
              AND m.status = 'active'
              AND p.stock_status = 'in_stock'
            GROUP BY p.category
            HAVING COUNT(*) >= $2
            ORDER BY product_count DESC
            LIMIT 100
        `, [tenantId, MIN_PRODUCTS_PER_CATEGORY]);

        // Generate sitemap XML
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

        for (const row of categoriesResult.rows) {
            const categorySlug = row.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const lastMod = new Date(row.last_updated).toISOString().split('T')[0];

            sitemap += `
  <url>
    <loc>${protocol}://${domain}/category/${categorySlug}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
        }

        sitemap += `
</urlset>`;

        res.type('application/xml');
        res.send(sitemap);
    } catch (error) {
        console.error('Error serving categories sitemap:', error);
        res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
});

// GET /sitemaps/brands.xml - Serve brands sitemap
router.get('/sitemaps/brands.xml', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const domain = req.get('host') || 'localhost';
        const protocol = req.secure ? 'https' : 'http';

        // Fetch brands with ≥ 2 active merchants and ≥ MIN_PRODUCTS_PER_BRAND products
        const MIN_PRODUCTS_PER_BRAND = parseInt(process.env.MIN_PRODUCTS_PER_BRAND) || 3;

        const brandsResult = await req.app.locals.db.query(`
            SELECT p.brand,
                   COUNT(DISTINCT p.merchant_id) as merchant_count,
                   COUNT(*) as product_count,
                   MAX(p.indexed_at) as last_updated
            FROM products p
            JOIN merchants m ON p.merchant_id = m.id
            WHERE p.tenant_id = $1
              AND p.brand IS NOT NULL
              AND p.brand != ''
              AND m.status = 'active'
              AND p.stock_status = 'in_stock'
            GROUP BY p.brand
            HAVING COUNT(DISTINCT p.merchant_id) >= 2 AND COUNT(*) >= $2
            ORDER BY product_count DESC
            LIMIT 100
        `, [tenantId, MIN_PRODUCTS_PER_BRAND]);

        // Generate sitemap XML
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

        for (const row of brandsResult.rows) {
            const brandSlug = row.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const lastMod = new Date(row.last_updated).toISOString().split('T')[0];

            sitemap += `
  <url>
    <loc>${protocol}://${domain}/brand/${brandSlug}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
        }

        sitemap += `
</urlset>`;

        res.type('application/xml');
        res.send(sitemap);
    } catch (error) {
        console.error('Error serving brands sitemap:', error);
        res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
});

// GET /sitemaps/buy-pages.xml - Serve buy pages sitemap (empty for now, will be populated later)
router.get('/sitemaps/buy-pages.xml', async (req, res) => {
    try {
        // Empty sitemap for now - will be populated when /buy/ routes are created
        // This is infrastructure safety: endpoint exists but returns minimal content
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Buy pages will be added here after traffic validation -->
</urlset>`;

        res.type('application/xml');
        res.send(sitemap);
    } catch (error) {
        console.error('Error serving buy-pages sitemap:', error);
        res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
});

module.exports = router;
