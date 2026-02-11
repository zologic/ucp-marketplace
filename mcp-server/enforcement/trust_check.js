/**
 * Trust score checking and enforcement logic
 */

/**
 * Check merchant trust score
 * @param {string} merchantId - Merchant UUID
 * @param {Pool} db - Database connection pool
 * @returns {Promise<{score: number, status: 'good'|'moderate'|'low'}>}
 */
async function checkTrustScore(merchantId, db) {
    try {
        const result = await db.query(`
            SELECT trust_score
            FROM merchants
            WHERE id = $1
        `, [merchantId]);

        if (result.rows.length === 0) {
            return {
                score: 0,
                status: 'low'
            };
        }

        const trustScore = result.rows[0].trust_score || 0;

        // Determine status based on score thresholds
        let status;
        if (trustScore >= 75) {
            status = 'good';
        } else if (trustScore >= 50) {
            status = 'moderate';
        } else {
            status = 'low';
        }

        return {
            score: trustScore,
            status: status
        };

    } catch (error) {
        console.error('Error checking trust score:', error);
        return {
            score: 0,
            status: 'low'
        };
    }
}

module.exports = {
    checkTrustScore
};
