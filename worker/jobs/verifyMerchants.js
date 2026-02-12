/**
 * Job: Verify Merchant UCP Endpoints
 * Frequency: Daily at 02:00 UTC
 */

const axios = require('axios');
const { parseManifest } = require('/app/utils/ucpParser');
const { sendEmail } = require('/app/services/emailService');

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

                // Parse and validate manifest using UCP parser
                const parsed = parseManifest(manifest);

                // Extract parsed data
                const businessName = parsed.businessProfile.name;
                const businessUrl = parsed.businessProfile.website;
                const businessDescription = parsed.businessProfile.description;
                const contactEmail = manifest.business_profile?.contact_email || null;
                const serviceBaseUrl = parsed.serviceBaseUrl;
                const publicKey = parsed.publicKey;
                const signingKeyId = parsed.signingKeyId;
                let capabilities = parsed.capabilities;
                const fullManifest = parsed.rawManifest;

                // Validate embedded checkout endpoint if present
                const embeddedCheckoutCap = capabilities.find(
                    cap => cap.name === 'dev.ucp.shopping.embedded_checkout' && cap.supported === true
                );

                if (embeddedCheckoutCap && embeddedCheckoutCap.endpoint) {
                    try {
                        // Test the embedded checkout endpoint with a test session ID
                        // Parameterized endpoints should return 400/401/403 (route exists, invalid request)
                        // 404 still means the route doesn't exist
                        const testSessionId = '00000000-0000-0000-0000-000000000000';
                        const testEndpoint = `${embeddedCheckoutCap.endpoint}/${testSessionId}`;

                        const testResponse = await axios.head(testEndpoint, {
                            timeout: 5000,
                            validateStatus: (status) => status < 500
                        });

                        // If endpoint returns 404 or 405, mark as not supported (route doesn't exist)
                        if (testResponse.status === 404 || testResponse.status === 405) {
                            console.log(`[verifyMerchants] ${merchant.domain}: Embedded checkout endpoint exists in manifest but returns ${testResponse.status}`);

                            // Mark capability as not supported
                            capabilities = capabilities.map(cap => {
                                if (cap.name === 'dev.ucp.shopping.embedded_checkout') {
                                    return { ...cap, supported: false, validation_error: `Endpoint returned ${testResponse.status}` };
                                }
                                return cap;
                            });
                        } else if (testResponse.status === 400 || testResponse.status === 401 || testResponse.status === 403) {
                            // 400/401/403 means route exists but request is invalid (expected for parameterized endpoints)
                            console.log(`[verifyMerchants] ${merchant.domain}: Embedded checkout endpoint validated (status ${testResponse.status} indicates route exists)`);
                        }
                    } catch (error) {
                        // If endpoint is unreachable, mark as not supported
                        console.log(`[verifyMerchants] ${merchant.domain}: Embedded checkout endpoint validation failed: ${error.message}`);

                        capabilities = capabilities.map(cap => {
                            if (cap.name === 'dev.ucp.shopping.embedded_checkout') {
                                return { ...cap, supported: false, validation_error: error.message };
                            }
                            return cap;
                        });
                    }
                }

                // Update merchant as verified
                const newStatus = merchant.status === 'pending' ? 'verified' : merchant.status;
                const wasJustVerified = merchant.status === 'pending';

                // Build full manifest with capabilities for storage
                const manifestForStorage = {
                    ...fullManifest,
                    capabilities: capabilities
                };

                await db.query(`
                    UPDATE merchants
                    SET ucp_endpoint = $1,
                        public_key = $2,
                        signing_key_id = $3,
                        service_base_url = $4,
                        business_name = $5,
                        business_description = $6,
                        business_url = $7,
                        contact_email = $8,
                        ucp_manifest = $9,
                        status = $10,
                        last_verified_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $11
                `, [
                    ucpEndpoint,
                    publicKey,
                    signingKeyId,
                    serviceBaseUrl,
                    businessName,
                    businessDescription,
                    businessUrl,
                    contactEmail,
                    JSON.stringify(manifestForStorage),
                    newStatus,
                    merchant.id
                ]);

                // Send welcome email if merchant was just verified for the first time
                if (wasJustVerified && contactEmail) {
                    await sendEmail(contactEmail, 'merchant_verified', {
                        merchant_domain: merchant.domain,
                        dashboard_link: `${process.env.APP_URL}/admin`
                    });
                }

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
