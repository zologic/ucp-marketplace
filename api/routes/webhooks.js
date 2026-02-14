/**
 * Webhook Routes
 * Handle webhooks from UCPReady WooCommerce plugin
 * ENHANCED: Phase 2B fraud detection (high-value orders + AOV anomalies)
 */

const express = require('express');
const router = express.Router();
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');
const nodemailer = require('nodemailer');

// Email configuration for admin notifications
const mailTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_PORT == 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// POST /api/webhooks/order-completed - Handle order completion webhook
router.post('/order-completed', async (req, res) => {
    try {
        // UCP 2026: Signature in Request-Signature header (JWT)
        // Legacy: Signature in request body
        const requestSignatureHeader = req.get('Request-Signature');
        const bodySignature = req.body.signature;

        const { order_id, merchant_domain, referral_id, total_cents, currency } = req.body;

        if (!order_id || !merchant_domain || !referral_id || !total_cents) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!requestSignatureHeader && !bodySignature) {
            return res.status(400).json({ error: 'Missing signature (Request-Signature header or body.signature)' });
        }

        const tenantId = req.tenant.id;

        // Look up merchant by domain
        const merchantResult = await req.app.locals.db.query(
            'SELECT * FROM merchants WHERE domain = $1 AND tenant_id = $2',
            [merchant_domain, tenantId]
        );

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        // Verify webhook signature using merchant's public key
        if (!merchant.public_key) {
            console.error('Merchant public key not found');
            return res.status(400).json({ error: 'Merchant not verified' });
        }

        // UCP 2026: Verify JWT signature from header
        let isValid = false;
        if (requestSignatureHeader) {
            isValid = verifyJwtSignature(
                JSON.stringify(req.body),
                requestSignatureHeader,
                merchant.public_key,
                merchant.ucp_manifest
            );
        }

        // Legacy: Verify plain Ed25519 signature from body
        if (!isValid && bodySignature) {
            isValid = verifySignature(
                { order_id, referral_id, total_cents, currency },
                bodySignature,
                merchant.public_key
            );
        }

        if (!isValid) {
            console.error('Invalid webhook signature');
            return res.status(400).json({ error: 'Invalid signature' });
        }

        // Check for duplicate order (by referral_id)
        const existingOrder = await req.app.locals.db.query(
            'SELECT id FROM orders WHERE referral_id = $1',
            [referral_id]
        );

        if (existingOrder.rows.length > 0) {
            console.log(`Order already recorded for referral_id: ${referral_id}`);
            return res.status(200).json({ status: 'ok', message: 'Order already recorded' });
        }

        // Look up checkout session
        const sessionResult = await req.app.locals.db.query(
            'SELECT * FROM checkout_sessions WHERE referral_id = $1',
            [referral_id]
        );

        let checkoutSessionId = null;
        let referralSource = 'UNKNOWN';
        if (sessionResult.rows.length > 0) {
            checkoutSessionId = sessionResult.rows[0].id;
            referralSource = sessionResult.rows[0].referral_source || 'UNKNOWN';

            // Update checkout session status
            await req.app.locals.db.query(
                'UPDATE checkout_sessions SET status = $1, completed_at = NOW() WHERE id = $2',
                ['completed', checkoutSessionId]
            );
        } else {
            // No checkout session found - use merchant domain as fallback source
            referralSource = `UCP-${merchant.domain}`;
        }

        // Create order record
        // Store whichever signature was used (JWT or legacy)
        const usedSignature = requestSignatureHeader || bodySignature;

        const orderResult = await req.app.locals.db.query(`
            INSERT INTO orders (tenant_id, merchant_id, checkout_session_id, referral_id, merchant_order_id, revenue_cents, currency, webhook_signature, verified, referral_source)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
            RETURNING id
        `, [tenantId, merchant.id, checkoutSessionId, referral_id, order_id, total_cents, currency, usedSignature, referralSource]);

        const orderId = orderResult.rows[0].id;

        // FRAUD DETECTION: Flag high-value orders for manual review
        const HIGH_VALUE_THRESHOLD = 10000; // €100.00 in cents

        if (total_cents > HIGH_VALUE_THRESHOLD) {
            await req.app.locals.db.query(`
                INSERT INTO order_reviews (order_id, merchant_id, revenue_cents, reason, status, created_at)
                VALUES ($1, $2, $3, 'high_value', 'pending', NOW())
            `, [orderId, merchant.id, total_cents]);

            // Send admin notification email
            await sendAdminNotification({
                subject: `High-Value Order Review: €${(total_cents / 100).toFixed(2)}`,
                merchant: merchant,
                order_id: order_id,
                revenue_cents: total_cents,
                reason: 'Order value exceeds €100 threshold',
                action_url: `${process.env.ADMIN_URL || 'https://admin.shopucp.eu'}/orders/${orderId}/review`
            });

            console.log(`[Webhook] ⚠️  High-value order flagged: ${order_id} (€${total_cents / 100})`);
        }

        // FRAUD DETECTION: Check for suspiciously low order value (AOV anomaly)
        const merchantStatsResult = await req.app.locals.db.query(`
            SELECT
                AVG(revenue_cents) as avg_revenue,
                STDDEV(revenue_cents) as stddev_revenue,
                COUNT(*) as order_count
            FROM orders
            WHERE merchant_id = $1
                AND created_at >= NOW() - INTERVAL '30 days'
                AND revenue_cents > 0
        `, [merchant.id]);

        const stats = merchantStatsResult.rows[0];

        if (stats.order_count >= 10) {
            // Only check anomalies if merchant has 10+ orders (minimum sample for statistical significance)
            const avgRevenue = parseFloat(stats.avg_revenue);
            const stddevRevenue = parseFloat(stats.stddev_revenue);

            if (stddevRevenue > 0) {
                const zScore = (total_cents - avgRevenue) / stddevRevenue;

                // Flag if order is more than 2 standard deviations below average
                if (zScore < -2) {
                    await req.app.locals.db.query(`
                        INSERT INTO order_reviews (order_id, merchant_id, revenue_cents, reason, status, created_at, metadata)
                        VALUES ($1, $2, $3, 'suspicious_low_value', 'pending', NOW(), $4)
                    `, [
                        orderId,
                        merchant.id,
                        total_cents,
                        JSON.stringify({
                            avg_revenue: avgRevenue,
                            stddev: stddevRevenue,
                            z_score: zScore.toFixed(2)
                        })
                    ]);

                    // Send admin notification
                    await sendAdminNotification({
                        subject: `Suspicious Order: €${(total_cents / 100).toFixed(2)} (AOV Anomaly)`,
                        merchant: merchant,
                        order_id: order_id,
                        revenue_cents: total_cents,
                        reason: `Order is ${Math.abs(zScore).toFixed(1)} standard deviations below merchant's average (€${(avgRevenue / 100).toFixed(2)})`,
                        action_url: `${process.env.ADMIN_URL || 'https://admin.shopucp.eu'}/orders/${orderId}/review`
                    });

                    console.log(`[Webhook] ⚠️  Suspicious low-value order flagged: ${order_id} (z-score: ${zScore.toFixed(2)})`);
                }
            }
        }

        // Get merchant billing configuration
        const billingResult = await req.app.locals.db.query(
            'SELECT * FROM merchant_billing WHERE merchant_id = $1',
            [merchant.id]
        );

        if (billingResult.rows.length > 0) {
            const billing = billingResult.rows[0];

            // Create billable event for commission
            if (billing.billing_mode === 'commission' && billing.commission_percent > 0) {
                const commissionAmount = Math.round((total_cents * billing.commission_percent) / 100);

                const billableEventResult = await req.app.locals.db.query(`
                    INSERT INTO billable_events (tenant_id, merchant_id, event_type, reference_id, amount_cents, currency, occurred_at)
                    VALUES ($1, $2, 'order', $3, $4, $5, NOW())
                    RETURNING id
                `, [tenantId, merchant.id, orderId, commissionAmount, currency]);

                const billableEventId = billableEventResult.rows[0].id;

                // Create revenue split if tenant has revenue share configured
                const revenueShareResult = await req.app.locals.db.query(
                    'SELECT * FROM tenant_revenue WHERE tenant_id = $1 AND status = $2',
                    [tenantId, 'active']
                );

                if (revenueShareResult.rows.length > 0) {
                    const revenueShare = revenueShareResult.rows[0];

                    if (revenueShare.revenue_share_percent > 0 &&
                        (revenueShare.applies_to === 'commission' || revenueShare.applies_to === 'both')) {
                        const tenantCents = Math.round((commissionAmount * revenueShare.revenue_share_percent) / 100);
                        const platformCents = commissionAmount - tenantCents;

                        await req.app.locals.db.query(`
                            INSERT INTO revenue_splits (billable_event_id, tenant_id, merchant_id, total_cents, tenant_cents, platform_cents, currency)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [billableEventId, tenantId, merchant.id, commissionAmount, tenantCents, platformCents, currency]);
                    }
                }
            }
        }

        res.status(200).json({
            status: 'ok',
            order_id: orderId
        });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});

// Helper function: Verify UCP 2026 JWT signature (RFC 7797 detached JWT)
function verifyJwtSignature(requestBody, jwtToken, publicKeyBase64, ucpManifest) {
    try {
        // Parse JWT (format: header.payload.signature or header..signature for detached)
        const parts = jwtToken.split('.');
        if (parts.length !== 3) {
            console.error('Invalid JWT format');
            return false;
        }

        const [headerB64, payloadB64, signatureB64] = parts;

        // Decode header to get kid (key ID)
        const header = JSON.parse(Buffer.from(headerB64, 'base64').toString('utf8'));
        const kid = header.kid;

        // Find the correct signing key from manifest
        let signingKey = null;
        if (ucpManifest && ucpManifest.signing_keys) {
            signingKey = ucpManifest.signing_keys.find(key => key.kid === kid);
        }

        // Fallback to default public key if kid not found
        const publicKey = signingKey ? signingKey.x : publicKeyBase64;

        // For detached JWT (RFC 7797), payload is empty and body is signed
        const messageToVerify = payloadB64 === ''
            ? `${headerB64}..${signatureB64}` // Detached: header..signature
            : jwtToken; // Regular JWT

        // Convert signature and public key
        const signatureBytes = util.decodeBase64(signatureB64.replace(/-/g, '+').replace(/_/g, '/'));
        const publicKeyBytes = util.decodeBase64(publicKey);

        // Message to sign: for detached JWT, it's the request body
        const bodyBytes = util.decodeUTF8(requestBody);

        // Verify Ed25519 signature
        return nacl.sign.detached.verify(bodyBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
        console.error('JWT signature verification error:', error);
        return false;
    }
}

// Helper function: Verify Ed25519 signature (legacy format)
function verifySignature(payload, signature, publicKeyBase64) {
    try {
        // Create canonical string from payload
        const message = JSON.stringify(payload, Object.keys(payload).sort());
        const messageBytes = util.decodeUTF8(message);
        const signatureBytes = util.decodeBase64(signature);
        const publicKeyBytes = util.decodeBase64(publicKeyBase64);

        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

// Helper: Send admin notification email for flagged orders
async function sendAdminNotification({ subject, merchant, order_id, revenue_cents, reason, action_url }) {
    try {
        await mailTransport.sendMail({
            from: process.env.SMTP_FROM || 'noreply@shopucp.eu',
            to: process.env.ADMIN_EMAIL || 'admin@shopucp.eu',
            subject: subject,
            html: `
                <h2>Order Review Required</h2>
                <p><strong>Merchant:</strong> ${merchant.domain}</p>
                <p><strong>Merchant Order ID:</strong> ${order_id}</p>
                <p><strong>Revenue:</strong> €${(revenue_cents / 100).toFixed(2)}</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <hr>
                <p><a href="${action_url}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 5px;">Review Order</a></p>
                <p style="color: #666; font-size: 12px; margin-top: 20px;">
                    This order has been flagged for manual review.
                    Commission is still calculated but should be verified before payout.
                </p>
            `
        });

        console.log(`[Webhook] ✓ Admin notification sent for order ${order_id}`);
    } catch (error) {
        console.error('[Webhook] Failed to send admin notification:', error.message);
        // Don't throw - email failure shouldn't block order processing
    }
}

module.exports = router;
