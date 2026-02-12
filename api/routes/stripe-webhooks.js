/**
 * Stripe Webhook Handler
 * Processes payment events from Stripe
 * Phase 2A: Handle invoice payment success/failure events
 */

const express = require('express');
const router = express.Router();

// Only initialize Stripe if API key is provided
const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;

const { sendEmail } = require('../services/emailService');

// POST /api/webhooks/stripe - Stripe webhook endpoint
// NOTE: This route must use express.raw() middleware (configured in server.js)
router.post('/stripe', async (req, res) => {
    // Check if Stripe is configured
    if (!stripe) {
        return res.status(503).json({
            error: 'Stripe not configured',
            message: 'Webhook endpoint requires STRIPE_SECRET_KEY to be set'
        });
    }

    const sig = req.headers['stripe-signature'];

    let event;

    try {
        // Verify webhook signature
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    // Handle event
    try {
        switch (event.type) {
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object, req.app.locals.db);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object, req.app.locals.db);
                break;

            case 'customer.subscription.deleted':
                // Not used (we use invoicing, not subscriptions)
                console.log('[Stripe Webhook] Subscription deleted event (ignored)');
                break;

            case 'payment_method.attached':
                console.log('[Stripe Webhook] Payment method attached');
                break;

            default:
                console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('[Stripe Webhook] Handler error:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

/**
 * Handle successful payment
 * Update invoice status to 'paid' in database
 */
async function handlePaymentSucceeded(stripeInvoice, db) {
    try {
        console.log(`[Stripe Webhook] Payment succeeded: ${stripeInvoice.id}`);

        // Find internal invoice by stripe_invoice_id
        const result = await db.query(
            'SELECT * FROM invoices WHERE stripe_invoice_id = $1',
            [stripeInvoice.id]
        );

        if (result.rows.length === 0) {
            console.warn(`[Stripe Webhook] Invoice not found in database: ${stripeInvoice.id}`);
            return;
        }

        const invoice = result.rows[0];

        // Update invoice status to paid
        await db.query(
            'UPDATE invoices SET status = $1, paid_at = NOW() WHERE id = $2',
            ['paid', invoice.id]
        );

        console.log(`[Stripe Webhook] ✓ Invoice ${invoice.invoice_number} marked as paid`);

    } catch (error) {
        console.error('[Stripe Webhook] Payment succeeded handler error:', error);
        throw error;
    }
}

/**
 * Handle failed payment
 * Update invoice status to 'overdue' and notify admin
 */
async function handlePaymentFailed(stripeInvoice, db) {
    try {
        console.log(`[Stripe Webhook] Payment failed: ${stripeInvoice.id}`);

        // Find internal invoice with merchant details
        const result = await db.query(`
            SELECT i.*, m.domain
            FROM invoices i
            JOIN merchants m ON i.merchant_id = m.id
            WHERE i.stripe_invoice_id = $1
        `, [stripeInvoice.id]);

        if (result.rows.length === 0) {
            console.warn(`[Stripe Webhook] Invoice not found in database: ${stripeInvoice.id}`);
            return;
        }

        const invoice = result.rows[0];

        // Update invoice status to overdue
        await db.query(
            'UPDATE invoices SET status = $1 WHERE id = $2',
            ['overdue', invoice.id]
        );

        // Update merchant billing status to overdue
        await db.query(
            'UPDATE merchant_billing SET status = $1 WHERE merchant_id = $2',
            ['overdue', invoice.merchant_id]
        );

        // Send notification to merchant
        const contactResult = await db.query(
            'SELECT email FROM merchant_contacts WHERE merchant_id = $1 AND role = $2 LIMIT 1',
            [invoice.merchant_id, 'billing']
        );

        if (contactResult.rows.length > 0) {
            const contactEmail = contactResult.rows[0].email;
            const retryDate = new Date();
            retryDate.setDate(retryDate.getDate() + 3); // Retry in 3 days

            await sendEmail(contactEmail, 'payment_failed', {
                invoice_number: invoice.invoice_number,
                amount: `${(invoice.total_cents / 100).toFixed(2)} ${invoice.currency}`,
                retry_date: retryDate.toISOString().split('T')[0]
            });
        }

        console.log(`[Stripe Webhook] ✓ Invoice ${invoice.invoice_number} marked as overdue and merchant notified`);

    } catch (error) {
        console.error('[Stripe Webhook] Payment failed handler error:', error);
        throw error;
    }
}

module.exports = router;
