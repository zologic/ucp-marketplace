/**
 * Job: Generate Monthly Invoices
 * Frequency: Monthly on 1st at 00:00 UTC
 * ENHANCED: Stripe integration for automated payment collection
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function generateInvoices(db) {
    const startTime = Date.now();
    console.log('[generateInvoices] Starting...');

    try {
        // Calculate previous month period
        const now = new Date();
        const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // First day of previous month

        const periodStartStr = periodStart.toISOString().split('T')[0];
        const periodEndStr = periodEnd.toISOString().split('T')[0];

        console.log(`[generateInvoices] Period: ${periodStartStr} to ${periodEndStr}`);

        // Get merchants with uninvoiced billable events
        const merchantsResult = await db.query(`
            SELECT DISTINCT merchant_id, tenant_id
            FROM billable_events
            WHERE invoiced = false
              AND DATE(occurred_at) BETWEEN $1 AND $2
        `, [periodStartStr, periodEndStr]);

        console.log(`[generateInvoices] Found ${merchantsResult.rows.length} merchants with unbilled events`);

        let invoicesCreated = 0;
        let stripeFailed = 0;

        for (const { merchant_id, tenant_id } of merchantsResult.rows) {
            try {
                // Get merchant billing configuration
                const billingResult = await db.query(
                    'SELECT * FROM merchant_billing WHERE merchant_id = $1',
                    [merchant_id]
                );

                if (billingResult.rows.length === 0) {
                    console.warn(`[generateInvoices] No billing config for merchant ${merchant_id}`);
                    continue;
                }

                const billing = billingResult.rows[0];

                // Get merchant CPC billing settings and Stripe customer ID
                const merchantResult = await db.query(
                    'SELECT cpc_billing_enabled, cpc_enabled_at, cpc_rate, stripe_customer_id, domain FROM merchants WHERE id = $1',
                    [merchant_id]
                );
                const merchant = merchantResult.rows[0];

                // Aggregate billable events
                // CRITICAL: Exclude CPC events if CPC billing is disabled
                // CRITICAL: Only include CPC events after cpc_enabled_at (non-retroactive)
                const eventsResult = await db.query(`
                    SELECT event_type, COUNT(*) as count, SUM(amount_cents) as total
                    FROM billable_events
                    WHERE merchant_id = $1
                      AND invoiced = false
                      AND DATE(occurred_at) BETWEEN $2 AND $3
                      AND (
                        -- Include all non-CPC events
                        event_type != 'click'
                        OR
                        -- Include CPC events only if enabled AND after enablement date
                        (
                          event_type = 'click'
                          AND $4 = true
                          AND occurred_at >= $5
                        )
                      )
                    GROUP BY event_type
                `, [merchant_id, periodStartStr, periodEndStr, merchant.cpc_billing_enabled, merchant.cpc_enabled_at]);

                const events = eventsResult.rows;

                if (events.length === 0) {
                    continue;
                }

                // Calculate invoice total
                let totalCents = 0;
                const invoiceItems = [];

                // Plugin fee (if configured)
                if (billing.plugin_fee_cents > 0) {
                    totalCents += billing.plugin_fee_cents;
                    invoiceItems.push({
                        description: `UCPReady Plugin License (${billing.billing_cycle})`,
                        quantity: 1,
                        unit_price_cents: billing.plugin_fee_cents,
                        total_cents: billing.plugin_fee_cents
                    });
                }

                // Add event-based charges
                for (const event of events) {
                    const eventTotal = parseInt(event.total) || 0;
                    totalCents += eventTotal;

                    let description = '';
                    if (event.event_type === 'click') {
                        description = `Cost Per Click (${event.count} clicks)`;
                    } else if (event.event_type === 'order') {
                        const percent = billing.commission_percent || 0;
                        description = `Commission (${event.count} orders at ${percent}%)`;
                    }

                    invoiceItems.push({
                        description,
                        quantity: parseInt(event.count),
                        unit_price_cents: Math.round(eventTotal / parseInt(event.count)),
                        total_cents: eventTotal
                    });
                }

                // Generate invoice number
                const invoiceNumber = `INV-${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${merchant_id.substring(0, 8)}`;

                // Create invoice
                const invoiceResult = await db.query(`
                    INSERT INTO invoices (
                        tenant_id, merchant_id, invoice_number, period_start, period_end,
                        total_cents, currency, status, issued_at, due_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'issued', NOW(), NOW() + INTERVAL '15 days')
                    RETURNING id
                `, [tenant_id, merchant_id, invoiceNumber, periodStartStr, periodEndStr, totalCents, billing.currency]);

                const invoiceId = invoiceResult.rows[0].id;

                // Create invoice items
                for (const item of invoiceItems) {
                    await db.query(`
                        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_cents, total_cents)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [invoiceId, item.description, item.quantity, item.unit_price_cents, item.total_cents]);
                }

                // STRIPE INTEGRATION: Create Stripe Invoice if customer exists
                let stripeInvoiceId = null;

                if (merchant.stripe_customer_id) {
                    try {
                        // Create Stripe Invoice
                        const stripeInvoice = await stripe.invoices.create({
                            customer: merchant.stripe_customer_id,
                            auto_advance: true, // Automatically finalize
                            collection_method: 'charge_automatically', // Auto-charge default payment method
                            metadata: {
                                internal_invoice_id: invoiceId,
                                merchant_id: merchant_id,
                                period_start: periodStartStr,
                                period_end: periodEndStr
                            }
                        });

                        // Add line items to Stripe Invoice
                        for (const item of invoiceItems) {
                            await stripe.invoiceItems.create({
                                customer: merchant.stripe_customer_id,
                                invoice: stripeInvoice.id,
                                amount: item.total_cents,
                                currency: billing.currency.toLowerCase(),
                                description: item.description
                            });
                        }

                        // Finalize invoice (triggers auto-charge)
                        const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id);

                        stripeInvoiceId = finalizedInvoice.id;

                        // Update database with Stripe invoice ID
                        await db.query(
                            'UPDATE invoices SET stripe_invoice_id = $1 WHERE id = $2',
                            [stripeInvoiceId, invoiceId]
                        );

                        console.log(`[generateInvoices] ✓ Stripe invoice created and finalized: ${stripeInvoiceId}`);
                    } catch (stripeError) {
                        console.error(`[generateInvoices] Stripe failed for merchant ${merchant.domain}:`, stripeError.message);
                        stripeFailed++;

                        // Invoice created in database but Stripe failed
                        // Admin will need to manually handle this
                    }
                } else {
                    console.warn(`[generateInvoices] Merchant ${merchant.domain} has no Stripe customer - manual payment required`);
                }

                // Mark billable events as invoiced
                // CRITICAL: Only mark events that were actually included in the invoice
                await db.query(`
                    UPDATE billable_events
                    SET invoiced = true
                    WHERE merchant_id = $1
                      AND invoiced = false
                      AND DATE(occurred_at) BETWEEN $2 AND $3
                      AND (
                        -- Mark all non-CPC events
                        event_type != 'click'
                        OR
                        -- Mark CPC events only if they were billed
                        (
                          event_type = 'click'
                          AND $4 = true
                          AND occurred_at >= $5
                        )
                      )
                `, [merchant_id, periodStartStr, periodEndStr, merchant.cpc_billing_enabled, merchant.cpc_enabled_at]);

                invoicesCreated++;
                console.log(`[generateInvoices] ✓ Created invoice ${invoiceNumber}: ${(totalCents / 100).toFixed(2)} ${billing.currency}`);

            } catch (error) {
                console.error(`[generateInvoices] Failed to create invoice for merchant ${merchant_id}:`, error.message);
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[generateInvoices] Completed in ${duration}s: ${invoicesCreated} invoices created`);
        if (stripeFailed > 0) {
            console.warn(`[generateInvoices] ⚠️  ${stripeFailed} Stripe charges failed - manual intervention required`);
        }

        return {
            invoices_created: invoicesCreated,
            stripe_failed: stripeFailed,
            period: { start: periodStartStr, end: periodEndStr }
        };
    } catch (error) {
        console.error('[generateInvoices] Job failed:', error);
        throw error;
    }
}

module.exports = { generateInvoices };
