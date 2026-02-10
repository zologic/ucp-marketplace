/**
 * Job: Generate Tenant Statements (Partner Payouts)
 * Frequency: Monthly on 1st at 01:00 UTC
 */

async function generateStatements(db) {
    const startTime = Date.now();
    console.log('[generateStatements] Starting...');

    try {
        // Calculate previous month period
        const now = new Date();
        const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);

        const periodStartStr = periodStart.toISOString().split('T')[0];
        const periodEndStr = periodEnd.toISOString().split('T')[0];

        console.log(`[generateStatements] Period: ${periodStartStr} to ${periodEndStr}`);

        // Get tenants with revenue splits in the period
        const tenantsResult = await db.query(`
            SELECT DISTINCT tenant_id
            FROM revenue_splits
            WHERE DATE(created_at) BETWEEN $1 AND $2
        `, [periodStartStr, periodEndStr]);

        console.log(`[generateStatements] Found ${tenantsResult.rows.length} tenants with revenue`);

        let statementsCreated = 0;

        for (const { tenant_id } of tenantsResult.rows) {
            try {
                // Sum tenant earnings for the period
                const revenueResult = await db.query(`
                    SELECT COALESCE(SUM(tenant_cents), 0) as total_earned, currency
                    FROM revenue_splits
                    WHERE tenant_id = $1
                      AND DATE(created_at) BETWEEN $2 AND $3
                    GROUP BY currency
                `, [tenant_id, periodStartStr, periodEndStr]);

                if (revenueResult.rows.length === 0) {
                    continue;
                }

                const revenue = revenueResult.rows[0];
                const totalEarnedCents = parseInt(revenue.total_earned) || 0;

                if (totalEarnedCents === 0) {
                    continue;
                }

                // Generate statement number
                const statementNumber = `STMT-${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${tenant_id.substring(0, 8)}`;

                // Create statement
                await db.query(`
                    INSERT INTO tenant_statements (
                        tenant_id, statement_number, period_start, period_end,
                        total_earned_cents, currency, status, issued_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, 'issued', NOW())
                `, [tenant_id, statementNumber, periodStartStr, periodEndStr, totalEarnedCents, revenue.currency || 'EUR']);

                statementsCreated++;
                console.log(`[generateStatements] ✓ Created statement ${statementNumber}: ${(totalEarnedCents / 100).toFixed(2)} ${revenue.currency || 'EUR'}`);

            } catch (error) {
                console.error(`[generateStatements] Failed to create statement for tenant ${tenant_id}:`, error.message);
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[generateStatements] Completed in ${duration}s: ${statementsCreated} statements created`);

        return { statements_created: statementsCreated, period: { start: periodStartStr, end: periodEndStr } };
    } catch (error) {
        console.error('[generateStatements] Job failed:', error);
        throw error;
    }
}

module.exports = { generateStatements };
