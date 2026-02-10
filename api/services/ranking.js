/**
 * Product Ranking Service
 * Production-grade ranking optimized for checkout completion
 */

/**
 * Calculate merchant trust score
 * Based on historical performance metrics
 */
async function calculateMerchantTrust(merchantId, db) {
    const stats = await db.query(`
        SELECT
            COALESCE(
                (SELECT COUNT(*) FROM checkout_sessions WHERE merchant_id = $1 AND status = 'completed') * 1.0 /
                NULLIF((SELECT COUNT(*) FROM checkout_sessions WHERE merchant_id = $1), 0),
                0.5
            ) as checkout_success_rate,
            COALESCE(
                (SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND verified = true) * 1.0 /
                NULLIF((SELECT COUNT(*) FROM orders WHERE merchant_id = $1), 0),
                0.8
            ) as webhook_reliability,
            CASE
                WHEN (SELECT last_verified_at FROM merchants WHERE id = $1) > NOW() - INTERVAL '7 days' THEN 1.0
                WHEN (SELECT last_verified_at FROM merchants WHERE id = $1) > NOW() - INTERVAL '30 days' THEN 0.7
                ELSE 0.3
            END as uptime_score,
            LEAST(
                EXTRACT(EPOCH FROM (NOW() - (SELECT created_at FROM merchants WHERE id = $1))) / (86400 * 90),
                1.0
            ) as age_score
    `, [merchantId]);

    const metrics = stats.rows[0];

    // Weighted trust score
    const trustScore =
        0.4 * metrics.checkout_success_rate +
        0.3 * metrics.webhook_reliability +
        0.2 * metrics.uptime_score +
        0.1 * metrics.age_score;

    return Math.max(0, Math.min(1, trustScore));
}

/**
 * Calculate availability score
 * Hard gate for purchasability
 */
function calculateAvailabilityScore(product) {
    if (product.stock_status === 'in_stock') {
        return 1.0;
    } else if (product.stock_status === 'backorder') {
        return 0.3;
    } else {
        return 0.0; // Out of stock
    }
}

/**
 * Calculate price relevance score
 * Optimizes for price closeness to intent, not absolute cheapest
 */
function calculatePriceScore(product, intent) {
    // If no price intent, treat all prices equally
    if (!intent.max_price_cents) {
        return 0.8; // Neutral score
    }

    const productPrice = product.price_cents;
    const targetPrice = intent.max_price_cents;

    // Exclude products over budget
    if (productPrice > targetPrice) {
        return 0.0;
    }

    // Calculate price closeness (prefer close to budget, not dirt cheap)
    const idealPrice = targetPrice * 0.85; // Ideal is ~85% of max budget
    const distance = Math.abs(productPrice - idealPrice);
    const maxDistance = targetPrice;

    const priceScore = 1 - (distance / maxDistance);

    return Math.max(0, Math.min(1, priceScore));
}

/**
 * Calculate text relevance score
 * Standard search relevance
 */
function calculateRelevanceScore(product, intent) {
    let score = 0.5; // Base score from full-text match

    // Boost for exact category match
    if (intent.category && product.category) {
        if (product.category.toLowerCase().includes(intent.category.toLowerCase())) {
            score += 0.3;
        }
    }

    // Boost for exact brand match
    if (intent.brand && product.brand) {
        if (product.brand.toLowerCase() === intent.brand.toLowerCase()) {
            score += 0.2;
        }
    }

    return Math.max(0, Math.min(1, score));
}

/**
 * Calculate freshness score
 * Rewards new products, prevents old products from dominating forever
 */
function calculateFreshnessScore(product) {
    // Calculate days since product was indexed
    const indexedAt = new Date(product.indexed_at);
    const now = new Date();
    const daysSinceIndexed = (now - indexedAt) / (1000 * 60 * 60 * 24);

    // Exponential decay with 30-day half-life
    // New products get score near 1.0, older products decay toward 0
    const freshnessScore = Math.exp(-daysSinceIndexed / 30);

    return Math.max(0, Math.min(1, freshnessScore));
}

/**
 * Apply diversity boost
 * Prevent one merchant from dominating results
 */
function applyDiversityBoost(rankedProducts) {
    const merchantCounts = {};
    const maxPerMerchantInTop10 = 3;

    return rankedProducts.map((product, index) => {
        const merchantId = product.merchant_id;
        merchantCounts[merchantId] = (merchantCounts[merchantId] || 0) + 1;

        // Apply penalty if merchant is over-represented in top 10
        if (index < 10 && merchantCounts[merchantId] > maxPerMerchantInTop10) {
            product.diversity_penalty = 0.5;
        } else {
            product.diversity_penalty = 1.0;
        }

        // Adjust final score
        product.final_score = product.final_score * product.diversity_penalty;

        return product;
    });
}

/**
 * Rank products using multi-factor scoring
 * Optimized for checkout completion, not cheapest price
 */
async function rankProducts(products, intent, db, categoryWeights = null) {
    // Default weights (adjust per category)
    const weights = categoryWeights || {
        availability: 0.30,
        price: 0.25,
        trust: 0.20,
        relevance: 0.15,
        diversity: 0.10
    };

    // Calculate merchant trust scores (batch)
    const merchantIds = [...new Set(products.map(p => p.merchant_id))];
    const trustScores = {};

    for (const merchantId of merchantIds) {
        trustScores[merchantId] = await calculateMerchantTrust(merchantId, db);
    }

    // Score each product
    const scoredProducts = products.map(product => {
        const availabilityScore = calculateAvailabilityScore(product);
        const priceScore = calculatePriceScore(product, intent);
        const trustScore = trustScores[product.merchant_id] || 0.5;
        const relevanceScore = calculateRelevanceScore(product, intent);
        const freshnessScore = calculateFreshnessScore(product);

        // Calculate final weighted score
        const finalScore =
            weights.availability * availabilityScore +
            weights.price * priceScore +
            weights.trust * trustScore +
            weights.relevance * relevanceScore +
            0.05 * freshnessScore; // 5% weight for freshness (keeps it small)

        return {
            ...product,
            availability_score: availabilityScore,
            price_score: priceScore,
            trust_score: trustScore,
            relevance_score: relevanceScore,
            freshness_score: freshnessScore,
            final_score: finalScore
        };
    });

    // Sort by final score (descending)
    scoredProducts.sort((a, b) => b.final_score - a.final_score);

    // Apply diversity boost
    const diversifiedProducts = applyDiversityBoost(scoredProducts);

    // Re-sort after diversity adjustment
    diversifiedProducts.sort((a, b) => b.final_score - a.final_score);

    return diversifiedProducts;
}

/**
 * Get category-specific weights
 * Different products need different ranking priorities
 */
function getCategoryWeights(category) {
    const categoryWeights = {
        'fashion': {
            availability: 0.35,
            price: 0.30,
            trust: 0.15,
            relevance: 0.15,
            diversity: 0.05
        },
        'electronics': {
            availability: 0.25,
            price: 0.20,
            trust: 0.35,
            relevance: 0.15,
            diversity: 0.05
        },
        'home': {
            availability: 0.30,
            price: 0.20,
            trust: 0.20,
            relevance: 0.25,
            diversity: 0.05
        }
    };

    return categoryWeights[category] || null; // Default to general weights
}

module.exports = {
    rankProducts,
    getCategoryWeights,
    calculateMerchantTrust,
    calculateAvailabilityScore,
    calculatePriceScore,
    calculateRelevanceScore,
    calculateFreshnessScore
};
