/**
 * Job: Verify Merchant UCP Endpoints
 * Frequency: Daily at 02:00 UTC
 */

const axios = require('axios');

async function verifyMerchants(db) {
    const startTime = Date.now();
    console.log('[verifyMerchants] Starting...');

    try {
        // Get merchants that need verification
        const result = await db.query(`
            SELECT id, domain, ucp_endpoint, status
            FROM merchants
            WHERE status IN ('pending', 'verified', 'active')
              AND (last_verified_at IS NULL OR last_verified_at < NOW() - INTERVAL '7 days')
            ORDER BY last_verified_at ASC NULLS FIRST
            LIMIT 100
        `);

        const merchants = result.rows;
        console.log(`[verifyMerchants] Found ${merchants.length} merchants to verify`);

        let successCount = 0;
        let failCount = 0;

        for (const merchant of merchants) {
            try {
                const ucpEndpoint = merchant.ucp_endpoint || `${merchant.domain}/.well-known/ucp`;

                // Fetch UCP manifest
                const response = await axios.get(ucpEndpoint, {
                    timeout: 10000,
                    validateStatus: (status) => status < 500
                });

                if (response.status !== 200) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const manifest = response.data;

                // Validate structure
                if (!manifest.products_endpoint || !manifest.checkout_endpoint || !manifest.public_key) {
                    throw new Error('Invalid manifest structure');
                }

                // Update merchant as verified
                const newStatus = merchant.status === 'pending' ? 'verified' : merchant.status;

                await db.query(`
                    UPDATE merchants
                    SET ucp_endpoint = $1, public_key = $2, status = $3, last_verified_at = NOW(), updated_at = NOW()
                    WHERE id = $4
                `, [ucpEndpoint, manifest.public_key, newStatus, merchant.id]);

                successCount++;
                console.log(`[verifyMerchants] ✓ ${merchant.domain}`);
            } catch (error) {
                failCount++;
                console.error(`[verifyMerchants] ✗ ${merchant.domain}: ${error.message}`);

                // Update last_verified_at even on failure
                await db.query(
                    'UPDATE merchants SET last_verified_at = NOW() WHERE id = $1',
                    [merchant.id]
                );

                // If merchant is active and failed 3+ times, consider suspending
                if (merchant.status === 'active') {
                    const failureCheck = await db.query(`
                        SELECT COUNT(*) as fail_count
                        FROM merchants
                        WHERE id = $1
                          AND last_verified_at > NOW() - INTERVAL '7 days'
                          AND ucp_endpoint IS NOT NULL
                    `, [merchant.id]);

                    // This is a simplified check; in production, track failures separately
                    // For now, we just log the issue
                    console.warn(`[verifyMerchants] Merchant ${merchant.domain} verification failing`);
                }
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[verifyMerchants] Completed in ${duration}s: ${successCount} success, ${failCount} failed`);

        return { success: successCount, failed: failCount };
    } catch (error) {
        console.error('[verifyMerchants] Job failed:', error);
        throw error;
    }
}

module.exports = { verifyMerchants };
