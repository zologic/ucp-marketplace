/**
 * Merchant payment and billing enforcement logic
 */

/**
 * Check if a merchant is eligible based on payment status
 * @param {string} merchantId - Merchant UUID
 * @param {Pool} db - Database connection pool
 * @returns {Promise<{eligible: boolean, reason: string}>}
 */
async function isMerchantEligible(merchantId, db) {
    try {
        // Query merchant billing information and overdue invoices
        const result = await db.query(`
            SELECT
                m.id,
                m.status as merchant_status,
                mb.status as billing_status,
                mb.balance_cents,
                mb.last_payment_at,
                m.admin_override,
                (
                    SELECT COUNT(*)
                    FROM invoices i
                    WHERE i.merchant_id = m.id
                      AND i.status = 'unpaid'
                      AND i.due_date < NOW() - INTERVAL '30 days'
                ) as overdue_invoices_count
            FROM merchants m
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE m.id = $1
        `, [merchantId]);

        if (result.rows.length === 0) {
            return {
                eligible: false,
                reason: 'Merchant not found'
            };
        }

        const merchant = result.rows[0];

        // Admin override bypasses all checks
        if (merchant.admin_override) {
            return {
                eligible: true,
                reason: 'Admin override enabled'
            };
        }

        // Check if merchant is active
        if (merchant.merchant_status !== 'active') {
            return {
                eligible: false,
                reason: 'Merchant not active'
            };
        }

        // Check billing status
        if (merchant.billing_status === 'suspended') {
            return {
                eligible: false,
                reason: 'Merchant billing suspended'
            };
        }

        // Check for overdue invoices (>30 days)
        if (merchant.overdue_invoices_count > 0) {
            return {
                eligible: false,
                reason: `Merchant has ${merchant.overdue_invoices_count} overdue invoice(s) >30 days`
            };
        }

        // Check negative balance (if applicable)
        if (merchant.balance_cents < 0) {
            return {
                eligible: false,
                reason: 'Merchant has negative balance'
            };
        }

        return {
            eligible: true,
            reason: 'Merchant payment status OK'
        };

    } catch (error) {
        console.error('Error checking merchant eligibility:', error);
        return {
            eligible: false,
            reason: `Database error: ${error.message}`
        };
    }
}

module.exports = {
    isMerchantEligible
};
