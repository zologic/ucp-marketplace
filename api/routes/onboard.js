/**
 * Merchant Onboarding Routes
 * Minimal friction onboarding with automatic detection
 */

const express = require('express');
const router = express.Router();
const { detectStore } = require('../services/detection');

// POST /api/onboard - Check store compatibility and create merchant record
router.post('/onboard', async (req, res) => {
    try {
        const { email, domain } = req.body;
        const tenantId = req.tenant.id;

        // Validation
        if (!email || !domain) {
            return res.status(400).json({
                error: 'Email and domain are required'
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Invalid email address'
            });
        }

        // Run store detection
        console.log(`[Onboarding] Detecting store: ${domain}`);
        const detection = await detectStore(domain);

        // Determine outcome
        const outcome = determineOutcome(detection);

        // Create or update merchant record (silent)
        const merchant = await createPendingMerchant(
            req.app.locals.db,
            tenantId,
            email,
            detection.domain,
            detection,
            outcome
        );

        console.log(`[Onboarding] Merchant ${merchant.id} created with outcome: ${outcome.type}`);

        // Return redirect instructions to frontend
        return res.json({
            success: true,
            merchant_id: merchant.id,
            outcome: outcome.type,
            message: outcome.message,
            redirect_url: outcome.redirect_url,
            redirect_delay: outcome.redirect_delay || 0,
            detection: {
                platform: detection.wooCommerce.platform,
                ucpready_installed: detection.ucpReady.installed,
                ucpready_active: detection.ucpReady.active
            }
        });

    } catch (error) {
        console.error('[Onboarding] Error:', error);
        return res.status(500).json({
            error: 'Unable to check your store. Please try again.'
        });
    }
});

/**
 * Determine onboarding outcome based on detection results
 * @param {Object} detection - Detection result from detectStore
 * @returns {Object} - Outcome with type, message, and redirect
 */
function determineOutcome(detection) {
    const { wooCommerce, ucpReady, domain } = detection;

    // Case 1: WooCommerce + UCPReady installed and active
    if (wooCommerce.detected && ucpReady.installed && ucpReady.active) {
        return {
            type: 'ready',
            message: 'Your store is ready! It will appear in search shortly.',
            redirect_url: null, // No redirect, show success
            merchant_status: 'pending_verification' // Will be activated by UCP crawl
        };
    }

    // Case 2: WooCommerce detected, but UCPReady not installed
    if (wooCommerce.detected && !ucpReady.installed) {
        // Redirect to WooCommerce plugin page
        const pluginUrl = 'https://woocommerce.com/products/ucpready';
        const utmParams = new URLSearchParams({
            utm_source: 'directory',
            utm_medium: 'onboarding',
            utm_campaign: 'auto-detect',
            store_domain: domain
        });

        return {
            type: 'install_plugin',
            message: 'Your store is compatible! Install UCPReady to get listed.',
            redirect_url: `${pluginUrl}?${utmParams.toString()}`,
            redirect_delay: 3000, // 3 second delay to show message
            merchant_status: 'pending_plugin'
        };
    }

    // Case 3: WooCommerce detected, UCPReady installed but inactive
    if (wooCommerce.detected && ucpReady.installed && !ucpReady.active) {
        return {
            type: 'activate_plugin',
            message: 'UCPReady is installed but not active. Please activate it in your WordPress admin.',
            redirect_url: `https://${domain}/wp-admin/plugins.php`,
            redirect_delay: 3000,
            merchant_status: 'pending_activation'
        };
    }

    // Case 4: Not WooCommerce
    return {
        type: 'unsupported',
        message: 'We currently support WooCommerce stores. Support for other platforms is coming soon.',
        redirect_url: null,
        merchant_status: 'unsupported'
    };
}

/**
 * Create pending merchant record
 * @param {Object} db - PostgreSQL pool
 * @param {string} tenantId - Tenant ID
 * @param {string} email - Merchant email
 * @param {string} domain - Normalized domain
 * @param {Object} detection - Detection results
 * @param {Object} outcome - Determined outcome
 * @returns {Object} - Created merchant record
 */
async function createPendingMerchant(db, tenantId, email, domain, detection, outcome) {
    // Check if merchant already exists
    const existingResult = await db.query(`
        SELECT id FROM merchants
        WHERE tenant_id = $1 AND domain = $2
    `, [tenantId, domain]);

    if (existingResult.rows.length > 0) {
        // Update existing merchant
        const merchantId = existingResult.rows[0].id;

        await db.query(`
            UPDATE merchants
            SET
                contact_email = $1,
                status = $2,
                detection_data = $3,
                last_detection_at = NOW(),
                updated_at = NOW()
            WHERE id = $4
        `, [email, outcome.merchant_status, JSON.stringify(detection), merchantId]);

        return {
            id: merchantId,
            domain,
            status: outcome.merchant_status
        };
    }

    // Create new merchant
    const result = await db.query(`
        INSERT INTO merchants (
            tenant_id,
            domain,
            contact_email,
            status,
            ucp_endpoint,
            detection_data,
            first_seen_at,
            last_detection_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, domain, status
    `, [
        tenantId,
        domain,
        email,
        outcome.merchant_status,
        detection.ucpReady.ucp_endpoint || `https://${domain}/.well-known/ucp`,
        JSON.stringify(detection)
    ]);

    return result.rows[0];
}

module.exports = router;
