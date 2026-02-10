/**
 * Store Detection Service
 * Detects WooCommerce and UCPReady plugin on merchant domains
 */

const axios = require('axios');

/**
 * Normalize domain input
 * @param {string} domain - Raw domain input from user
 * @returns {string} - Normalized domain (no protocol, no paths)
 */
function normalizeDomain(domain) {
    // Remove protocol if present
    let normalized = domain.replace(/^https?:\/\//, '');

    // Remove www. prefix
    normalized = normalized.replace(/^www\./, '');

    // Remove trailing slash and any paths
    normalized = normalized.split('/')[0];

    // Remove port if present (unless it's a dev environment)
    normalized = normalized.split(':')[0];

    return normalized.toLowerCase().trim();
}

/**
 * Detect WooCommerce installation
 * @param {string} domain - Normalized domain
 * @returns {Object} - Detection result
 */
async function detectWooCommerce(domain) {
    const baseUrl = `https://${domain}`;
    const timeout = 10000; // 10 second timeout

    const checks = {
        wc_api: false,
        wp_api: false,
        html_assets: false,
        headers: false
    };

    try {
        // Check 1: WooCommerce REST API endpoint
        try {
            const wcApiResponse = await axios.get(`${baseUrl}/wp-json/wc/v3`, {
                timeout,
                validateStatus: (status) => status < 500 // Don't throw on 401/404
            });

            // 401 or 200 means WC API exists (401 = needs auth, which is expected)
            if (wcApiResponse.status === 401 || wcApiResponse.status === 200) {
                checks.wc_api = true;
            }
        } catch (err) {
            // Ignore - endpoint might not exist
        }

        // Check 2: WordPress REST API (confirms WordPress)
        try {
            const wpApiResponse = await axios.get(`${baseUrl}/wp-json`, {
                timeout,
                validateStatus: (status) => status < 500
            });

            if (wpApiResponse.status === 200) {
                checks.wp_api = true;

                // Check for WooCommerce in namespaces
                const data = wpApiResponse.data;
                if (data.namespaces && data.namespaces.includes('wc/v3')) {
                    checks.wc_api = true;
                }
            }
        } catch (err) {
            // Ignore
        }

        // Check 3: HTML assets check (look for WooCommerce in page source)
        try {
            const htmlResponse = await axios.get(baseUrl, {
                timeout,
                headers: {
                    'User-Agent': 'UCPReady-Directory/1.0'
                }
            });

            const html = htmlResponse.data.toLowerCase();

            // Look for WooCommerce assets in HTML
            if (html.includes('woocommerce') ||
                html.includes('wc-') ||
                html.includes('/wp-content/plugins/woocommerce/')) {
                checks.html_assets = true;
            }

            // Check response headers for WordPress indicators
            const headers = htmlResponse.headers;
            if (headers['x-powered-by']?.includes('WordPress') ||
                headers['link']?.includes('wp-json')) {
                checks.headers = true;
            }
        } catch (err) {
            // Ignore - site might block scraping
        }

        // Determine if WooCommerce is detected
        const detected = checks.wc_api || (checks.wp_api && checks.html_assets);

        // Calculate confidence score (0-100)
        // WC API = high confidence (alone sufficient)
        // WP API + HTML assets = medium-high confidence
        // Headers/HTML alone = low confidence
        let confidence = 0;
        if (checks.wc_api) {
            confidence = 95; // Very high confidence
        } else if (checks.wp_api && checks.html_assets) {
            confidence = 80; // High confidence
        } else if (checks.wp_api || checks.html_assets) {
            confidence = 40; // Low confidence
        } else if (checks.headers) {
            confidence = 20; // Very low confidence
        }

        return {
            platform: detected ? 'woocommerce' : 'unknown',
            detected,
            confidence,
            checks
        };

    } catch (error) {
        return {
            platform: 'unknown',
            detected: false,
            confidence: 0,
            checks,
            error: error.message
        };
    }
}

/**
 * Detect UCPReady plugin installation
 * @param {string} domain - Normalized domain
 * @returns {Object} - Detection result
 */
async function detectUCPReady(domain) {
    const baseUrl = `https://${domain}`;
    const timeout = 10000;

    const result = {
        installed: false,
        active: false,
        version: null,
        ucp_endpoint: null,
        confidence: 0
    };

    try {
        // Check 1: UCP manifest (/.well-known/ucp)
        try {
            const manifestResponse = await axios.get(`${baseUrl}/.well-known/ucp`, {
                timeout,
                validateStatus: (status) => status === 200
            });

            if (manifestResponse.status === 200) {
                const manifest = manifestResponse.data;

                result.installed = true;
                result.active = true;
                result.ucp_endpoint = `${baseUrl}/.well-known/ucp`;
                result.confidence = 95; // UCP manifest = very high confidence

                // Extract version if available
                if (manifest.version) {
                    result.version = manifest.version;
                }
            }
        } catch (err) {
            // Try alternative endpoint
        }

        // Check 2: UCPReady status endpoint
        if (!result.installed) {
            try {
                const statusResponse = await axios.get(`${baseUrl}/wp-json/ucpready/v1/status`, {
                    timeout,
                    validateStatus: (status) => status === 200
                });

                if (statusResponse.status === 200) {
                    const status = statusResponse.data;

                    result.installed = true;
                    result.active = status.active !== false; // Default to true if not specified
                    result.version = status.version || null;
                    result.ucp_endpoint = `${baseUrl}/.well-known/ucp`;
                    result.confidence = 85; // Status endpoint = high confidence
                }
            } catch (err) {
                // Plugin not installed or inactive
            }
        }

        return result;

    } catch (error) {
        return {
            ...result,
            error: error.message
        };
    }
}

/**
 * Full store detection (WooCommerce + UCPReady)
 * @param {string} rawDomain - Raw domain input from user
 * @returns {Object} - Complete detection result
 */
async function detectStore(rawDomain) {
    const domain = normalizeDomain(rawDomain);

    // Run both detections in parallel
    const [wooCommerce, ucpReady] = await Promise.all([
        detectWooCommerce(domain),
        detectUCPReady(domain)
    ]);

    return {
        domain,
        wooCommerce,
        ucpReady,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    normalizeDomain,
    detectWooCommerce,
    detectUCPReady,
    detectStore
};
