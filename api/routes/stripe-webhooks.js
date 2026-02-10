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

const nodemailer = require('nodemailer');

// Email configuration for admin notifications
const mailTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

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

        // Send admin notification email
        try {
            await mailTransport.sendMail({
                from: process.env.SMTP_FROM || 'noreply@shopucp.eu',
                to: process.env.ADMIN_EMAIL || 'admin@shopucp.eu',
                subject: `Payment Failed: ${invoice.invoice_number}`,
                html: `
                    <h2>Payment Failed</h2>
                    <p><strong>Merchant:</strong> ${invoice.domain}</p>
                    <p><strong>Invoice:</strong> ${invoice.invoice_number}</p>
                    <p><strong>Amount:</strong> €${(invoice.total_cents / 100).toFixed(2)}</p>
                    <p><strong>Stripe Invoice:</strong> <a href="https://dashboard.stripe.com/invoices/${stripeInvoice.id}">${stripeInvoice.id}</a></p>
                    <hr>
                    <p style="color: #d32f2f;"><strong>Action required:</strong> Review and contact merchant.</p>
                    <p style="color: #666; font-size: 12px;">
                        The merchant's payment method was declined.
                        Consider suspending the merchant if payment is not received within the grace period.
                    </p>
                `
            });

            console.log(`[Stripe Webhook] ✓ Admin notified of failed payment for ${invoice.invoice_number}`);
        } catch (emailError) {
            console.error('[Stripe Webhook] Failed to send admin notification email:', emailError.message);
            // Don't throw - email failure shouldn't block webhook processing
        }

    } catch (error) {
        console.error('[Stripe Webhook] Payment failed handler error:', error);
        throw error;
    }
}

module.exports = router;
