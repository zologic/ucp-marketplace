/**
 * Job: Daily Stats Rollup
 * Frequency: Daily at 00:30 UTC
 */

async function rollupStats(db) {
    const startTime = Date.now();
    console.log('[rollupStats] Starting...');

    try {
        // Get yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        console.log(`[rollupStats] Rolling up stats for ${dateStr}`);

        // Get all tenant/merchant combinations that had activity yesterday
        const merchantsResult = await db.query(`
            SELECT DISTINCT tenant_id, merchant_id
            FROM (
                SELECT tenant_id, merchant_id FROM search_events WHERE DATE(created_at) = $1
                UNION
                SELECT tenant_id, merchant_id FROM click_events WHERE DATE(created_at) = $1
                UNION
                SELECT tenant_id, merchant_id FROM checkout_sessions WHERE DATE(created_at) = $1
                UNION
                SELECT tenant_id, merchant_id FROM orders WHERE DATE(created_at) = $1
            ) AS combined
        `, [dateStr]);

        console.log(`[rollupStats] Found ${merchantsResult.rows.length} tenant/merchant combinations to process`);

        let processedCount = 0;

        for (const { tenant_id, merchant_id } of merchantsResult.rows) {
            try {
                // Count search events
                const searchResult = await db.query(
                    'SELECT COUNT(*) as count FROM search_events WHERE tenant_id = $1 AND merchant_id = $2 AND DATE(created_at) = $3',
                    [tenant_id, merchant_id, dateStr]
                );
                const searchCount = parseInt(searchResult.rows[0].count) || 0;

                // Count click events
                const clickResult = await db.query(
                    'SELECT COUNT(*) as count FROM click_events WHERE tenant_id = $1 AND merchant_id = $2 AND DATE(created_at) = $3',
                    [tenant_id, merchant_id, dateStr]
                );
                const clickCount = parseInt(clickResult.rows[0].count) || 0;

                // Count checkout sessions (non-abandoned)
                const checkoutResult = await db.query(
                    'SELECT COUNT(*) as count FROM checkout_sessions WHERE tenant_id = $1 AND merchant_id = $2 AND status != $3 AND DATE(created_at) = $4',
                    [tenant_id, merchant_id, 'abandoned', dateStr]
                );
                const checkoutCount = parseInt(checkoutResult.rows[0].count) || 0;

                // Count orders and sum revenue
                const orderResult = await db.query(
                    'SELECT COUNT(*) as count, COALESCE(SUM(revenue_cents), 0) as revenue FROM orders WHERE tenant_id = $1 AND merchant_id = $2 AND DATE(created_at) = $3',
                    [tenant_id, merchant_id, dateStr]
                );
                const orderCount = parseInt(orderResult.rows[0].count) || 0;
                const revenueCents = parseInt(orderResult.rows[0].revenue) || 0;

                // Upsert into merchant_daily_stats
                await db.query(`
                    INSERT INTO merchant_daily_stats (
                        tenant_id, merchant_id, date, search_count, click_count, checkout_count, order_count, revenue_cents
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (merchant_id, date) DO UPDATE SET
                        search_count = EXCLUDED.search_count,
                        click_count = EXCLUDED.click_count,
                        checkout_count = EXCLUDED.checkout_count,
                        order_count = EXCLUDED.order_count,
                        revenue_cents = EXCLUDED.revenue_cents
                `, [tenant_id, merchant_id, dateStr, searchCount, clickCount, checkoutCount, orderCount, revenueCents]);

                processedCount++;
            } catch (error) {
                console.error(`[rollupStats] Failed to process tenant ${tenant_id}, merchant ${merchant_id}:`, error.message);
            }
        }

        // Optional: Delete old raw events (older than 90 days) to save space
        const deleteDate = new Date();
        deleteDate.setDate(deleteDate.getDate() - 90);
        const deleteDateStr = deleteDate.toISOString().split('T')[0];

        await db.query('DELETE FROM search_events WHERE created_at < $1', [deleteDateStr]);
        await db.query('DELETE FROM click_events WHERE created_at < $1', [deleteDateStr]);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[rollupStats] Completed in ${duration}s: ${processedCount} merchant/day stats updated`);

        return { processed: processedCount, date: dateStr };
    } catch (error) {
        console.error('[rollupStats] Job failed:', error);
        throw error;
    }
}

module.exports = { rollupStats };
