/**
 * Job: Enforce Non-Payment (Suspend Overdue Merchants)
 * Frequency: Daily at 06:00 UTC
 */

const axios = require('axios');

async function enforceNonPayment(db) {
    const startTime = Date.now();
    console.log('[enforceNonPayment] Starting...');

    try {
        // Find overdue invoices (past due date, not paid)
        await db.query(`
            UPDATE invoices
            SET status = 'overdue'
            WHERE status = 'issued'
              AND due_at < NOW()
        `);

        // Find merchants with overdue invoices past grace period
        const overdueResult = await db.query(`
            SELECT DISTINCT i.merchant_id, m.domain, mb.grace_period_days
            FROM invoices i
            JOIN merchants m ON i.merchant_id = m.id
            LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE i.status = 'overdue'
              AND i.due_at + INTERVAL '1 day' * COALESCE(mb.grace_period_days, 7) < NOW()
              AND m.status != 'suspended'
              AND m.admin_override = false
        `);

        const overduemerchants = overdueResult.rows;
        console.log(`[enforceNonPayment] Found ${overduemerchants.length} merchants past grace period`);

        let suspendedCount = 0;

        for (const merchant of overduemerchants) {
            try {
                // Suspend merchant
                await db.query(`
                    UPDATE merchants
                    SET status = 'suspended', updated_at = NOW()
                    WHERE id = $1
                `, [merchant.merchant_id]);

                // Suspend billing
                await db.query(`
                    UPDATE merchant_billing
                    SET status = 'suspended', updated_at = NOW()
                    WHERE merchant_id = $1
                `, [merchant.merchant_id]);

                suspendedCount++;
                console.log(`[enforceNonPayment] ✓ Suspended ${merchant.domain} for non-payment`);

            } catch (error) {
                console.error(`[enforceNonPayment] Failed to suspend merchant ${merchant.merchant_id}:`, error.message);
            }
        }

        // Reactivate merchants with paid invoices
        const paidResult = await db.query(`
            SELECT DISTINCT m.id, m.domain
            FROM merchants m
            JOIN merchant_billing mb ON m.id = mb.merchant_id
            WHERE m.status = 'suspended'
              AND mb.status = 'suspended'
              AND NOT EXISTS (
                  SELECT 1 FROM invoices
                  WHERE merchant_id = m.id AND status IN ('issued', 'overdue')
              )
        `);

        const paidMerchants = paidResult.rows;
        console.log(`[enforceNonPayment] Found ${paidMerchants.length} merchants with resolved billing`);

        let reactivatedCount = 0;

        for (const merchant of paidMerchants) {
            try {
                // Reactivate merchant
                await db.query(`
                    UPDATE merchants
                    SET status = 'active', updated_at = NOW()
                    WHERE id = $1
                `, [merchant.id]);

                // Reactivate billing
                await db.query(`
                    UPDATE merchant_billing
                    SET status = 'active', updated_at = NOW()
                    WHERE merchant_id = $1
                `, [merchant.id]);

                reactivatedCount++;
                console.log(`[enforceNonPayment] ✓ Reactivated ${merchant.domain}`);

            } catch (error) {
                console.error(`[enforceNonPayment] Failed to reactivate merchant ${merchant.id}:`, error.message);
            }
        }

        // Trigger MCP reload if any changes were made
        if (suspendedCount > 0 || reactivatedCount > 0) {
            const mcpUrl = process.env.MCP_URL || 'http://mcp-server:8080';
            try {
                await axios.post(`${mcpUrl}/internal/reload`, {}, { timeout: 5000 });
                console.log('[enforceNonPayment] MCP reload triggered');
            } catch (error) {
                console.error('[enforceNonPayment] MCP reload failed:', error.message);
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[enforceNonPayment] Completed in ${duration}s: ${suspendedCount} suspended, ${reactivatedCount} reactivated`);

        return { suspended: suspendedCount, reactivated: reactivatedCount };
    } catch (error) {
        console.error('[enforceNonPayment] Job failed:', error);
        throw error;
    }
}

module.exports = { enforceNonPayment };
