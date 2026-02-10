/**
 * Webhook Routes
 * Handle webhooks from UCPReady WooCommerce plugin
 */

const express = require('express');
const router = express.Router();
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

// POST /api/webhooks/order-completed - Handle order completion webhook
router.post('/order-completed', async (req, res) => {
    try {
        const { order_id, merchant_domain, referral_id, total_cents, currency, signature } = req.body;

        if (!order_id || !merchant_domain || !referral_id || !total_cents || !signature) {
            return res.status(400).json({ error: 'Missing required fields' });
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

        const isValid = verifySignature(
            { order_id, referral_id, total_cents, currency },
            signature,
            merchant.public_key
        );

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
        if (sessionResult.rows.length > 0) {
            checkoutSessionId = sessionResult.rows[0].id;

            // Update checkout session status
            await req.app.locals.db.query(
                'UPDATE checkout_sessions SET status = $1, completed_at = NOW() WHERE id = $2',
                ['completed', checkoutSessionId]
            );
        }

        // Create order record
        const orderResult = await req.app.locals.db.query(`
            INSERT INTO orders (tenant_id, merchant_id, checkout_session_id, referral_id, merchant_order_id, revenue_cents, currency, webhook_signature, verified)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
            RETURNING id
        `, [tenantId, merchant.id, checkoutSessionId, referral_id, order_id, total_cents, currency, signature]);

        const orderId = orderResult.rows[0].id;

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

// Helper function: Verify Ed25519 signature
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

module.exports = router;
