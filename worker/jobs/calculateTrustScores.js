/**
 * Job: Calculate Trust Scores
 * Frequency: Daily at 04:00 UTC (after stats rollup completes at 00:30 UTC)
 * Purpose: Pre-calculate merchant trust scores for performance-aware ranking
 *
 * Trust Score Formula:
 * - Order volume (40%): 0-100 orders = 0.0-1.0
 * - Conversion rate (30%): click-to-order conversion
 * - Account age (20%): 0-90 days = 0.0-1.0
 * - Checkout completion (10%): inverse of abandonment rate
 */

async function calculateTrustScores(db) {
    const startTime = Date.now();
    console.log('[calculateTrustScores] Starting...');

    try {
        // Update all merchants with aggregated trust score calculation
        const result = await db.query(`
            UPDATE merchants m
            SET
                trust_score = (
                    -- 1. Order volume score (40% weight)
                    -- Scale: 0-100 orders = 0.0-1.0, capped at 100 to prevent mega-merchant domination
                    LEAST(stats.order_count / 100.0, 1.0) * 0.4 +

                    -- 2. Conversion rate score (30% weight)
                    -- Click-to-order conversion rate (direct measurement of product-market fit)
                    CASE
                        WHEN stats.click_count > 0
                        THEN (stats.order_count::float / stats.click_count::float) * 0.3
                        ELSE 0
                    END +

                    -- 3. Account age score (20% weight)
                    -- Scale: 0-90 days = 0.0-1.0, capped at 90 to prevent unfair disadvantage to new merchants
                    LEAST(
                        EXTRACT(EPOCH FROM (NOW() - m.created_at)) / (86400 * 90),
                        1.0
                    ) * 0.2 +

                    -- 4. Checkout completion score (10% weight)
                    -- Inverse of abandonment rate (penalizes high abandonment)
                    CASE
                        WHEN cs_stats.total_sessions > 0
                        THEN (1.0 - (cs_stats.abandoned::float / cs_stats.total_sessions::float)) * 0.1
                        ELSE 0.05 -- Neutral score if no data
                    END
                ),
                trust_score_updated_at = NOW()

            FROM (
                -- Aggregate stats from last 90 days
                SELECT
                    merchant_id,
                    SUM(click_count) as click_count,
                    SUM(order_count) as order_count
                FROM merchant_daily_stats
                WHERE date >= CURRENT_DATE - INTERVAL '90 days'
                GROUP BY merchant_id
            ) stats

            LEFT JOIN (
                -- Checkout session statistics (abandonment tracking)
                SELECT
                    merchant_id,
                    COUNT(*) as total_sessions,
                    COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned
                FROM checkout_sessions
                WHERE created_at >= NOW() - INTERVAL '90 days'
                GROUP BY merchant_id
            ) cs_stats ON cs_stats.merchant_id = stats.merchant_id

            WHERE m.id = stats.merchant_id
        `);

        const updatedCount = result.rowCount;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`[calculateTrustScores] ✓ Completed in ${duration}s: ${updatedCount} merchants updated`);

        return {
            merchants_updated: updatedCount,
            duration_seconds: parseFloat(duration)
        };
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.error(`[calculateTrustScores] ✗ Job failed after ${duration}s:`, error);
        throw error;
    }
}

module.exports = { calculateTrustScores };
