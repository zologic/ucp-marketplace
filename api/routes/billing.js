/**
 * Billing Routes
 * Merchant payment method management and Stripe integration
 * Phase 2A: Automated billing with Stripe Invoicing API
 */

const express = require('express');
const router = express.Router();

// Only initialize Stripe if API key is provided
const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;

// Middleware to check if Stripe is configured
const requireStripe = (req, res, next) => {
    if (!stripe) {
        return res.status(503).json({
            error: 'Stripe not configured',
            message: 'Billing features require STRIPE_SECRET_KEY to be set'
        });
    }
    next();
};

// POST /api/billing/create-customer
// Called when merchant first installs UCPReady plugin OR when admin enables CPC billing
router.post('/create-customer', requireStripe, async (req, res) => {
    try {
        const { merchant_id } = req.body;

        if (!merchant_id) {
            return res.status(400).json({ error: 'merchant_id required' });
        }

        // Get merchant details
        const merchantResult = await req.app.locals.db.query(
            'SELECT * FROM merchants WHERE id = $1',
            [merchant_id]
        );

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];

        // Check if Stripe customer already exists
        if (merchant.stripe_customer_id) {
            return res.json({
                customer_id: merchant.stripe_customer_id,
                message: 'Customer already exists'
            });
        }

        // Get merchant contact info from merchant_contacts table
        const contactResult = await req.app.locals.db.query(
            'SELECT email, name FROM merchant_contacts WHERE merchant_id = $1 AND is_primary = true LIMIT 1',
            [merchant_id]
        );

        const contact = contactResult.rows[0] || {
            email: `merchant-${merchant_id.substring(0, 8)}@temp.shopucp.eu`,
            name: merchant.domain
        };

        // Create Stripe Customer
        const customer = await stripe.customers.create({
            email: contact.email,
            name: contact.name || merchant.domain,
            metadata: {
                merchant_id: merchant_id,
                tenant_id: merchant.tenant_id,
                domain: merchant.domain
            }
        });

        // Store Stripe customer ID in database
        await req.app.locals.db.query(
            'UPDATE merchants SET stripe_customer_id = $1 WHERE id = $2',
            [customer.id, merchant_id]
        );

        console.log(`[Billing] ✓ Stripe customer created: ${customer.id} for merchant ${merchant.domain}`);

        res.json({
            customer_id: customer.id,
            message: 'Stripe customer created successfully'
        });
    } catch (error) {
        console.error('[Billing] Create customer error:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

// POST /api/billing/attach-payment-method
// Called when merchant adds payment method via Stripe Elements
router.post('/attach-payment-method', requireStripe, async (req, res) => {
    try {
        const { merchant_id, payment_method_id } = req.body;

        if (!merchant_id || !payment_method_id) {
            return res.status(400).json({ error: 'merchant_id and payment_method_id required' });
        }

        // Get merchant's Stripe customer ID
        const merchantResult = await req.app.locals.db.query(
            'SELECT stripe_customer_id, domain FROM merchants WHERE id = $1',
            [merchant_id]
        );

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const merchant = merchantResult.rows[0];
        const stripeCustomerId = merchant.stripe_customer_id;

        if (!stripeCustomerId) {
            return res.status(400).json({
                error: 'No Stripe customer found',
                message: 'Call /create-customer first'
            });
        }

        // Attach payment method to customer
        await stripe.paymentMethods.attach(payment_method_id, {
            customer: stripeCustomerId
        });

        // Set as default payment method for invoices
        await stripe.customers.update(stripeCustomerId, {
            invoice_settings: {
                default_payment_method: payment_method_id
            }
        });

        console.log(`[Billing] ✓ Payment method attached for merchant ${merchant.domain}`);

        res.json({
            success: true,
            message: 'Payment method attached successfully'
        });
    } catch (error) {
        console.error('[Billing] Attach payment method error:', error);

        if (error.type === 'StripeCardError') {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({ error: 'Failed to attach payment method' });
    }
});

// GET /api/billing/payment-methods/:merchant_id
// Get merchant's payment methods for display in admin UI
router.get('/payment-methods/:merchant_id', requireStripe, async (req, res) => {
    try {
        const { merchant_id } = req.params;

        const merchantResult = await req.app.locals.db.query(
            'SELECT stripe_customer_id FROM merchants WHERE id = $1',
            [merchant_id]
        );

        if (merchantResult.rows.length === 0) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const stripeCustomerId = merchantResult.rows[0].stripe_customer_id;

        if (!stripeCustomerId) {
            return res.json({ payment_methods: [] });
        }

        // Fetch payment methods from Stripe
        const paymentMethods = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: 'card'
        });

        res.json({
            payment_methods: paymentMethods.data.map(pm => ({
                id: pm.id,
                brand: pm.card.brand,
                last4: pm.card.last4,
                exp_month: pm.card.exp_month,
                exp_year: pm.card.exp_year
            }))
        });
    } catch (error) {
        console.error('[Billing] List payment methods error:', error);
        res.status(500).json({ error: 'Failed to list payment methods' });
    }
});

// DELETE /api/billing/payment-method/:payment_method_id
// Remove payment method
router.delete('/payment-method/:payment_method_id', requireStripe, async (req, res) => {
    try {
        const { payment_method_id } = req.params;

        await stripe.paymentMethods.detach(payment_method_id);

        res.json({ success: true, message: 'Payment method removed' });
    } catch (error) {
        console.error('[Billing] Remove payment method error:', error);
        res.status(500).json({ error: 'Failed to remove payment method' });
    }
});

module.exports = router;
