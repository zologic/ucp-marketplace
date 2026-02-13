/**
 * Smart Query Parser - Hybrid NLP/Pattern Matching Approach
 * Extracts intent from natural language search queries
 *
 * Examples:
 * "cheap laptops" → { query: "laptops", filters: { price_indicator: "cheap" } }
 * "best smartphones under 500 euros" → { query: "smartphones", filters: { price_max: 50000, sort: "rating" } }
 * "gaming laptop 1000 to 1500" → { query: "gaming laptop", filters: { price_min: 100000, price_max: 150000 } }
 */

// Price indicator patterns
const PRICE_PATTERNS = {
    cheap: ['cheap', 'affordable', 'budget', 'inexpensive', 'economical', 'low cost', 'low-cost'],
    expensive: ['expensive', 'premium', 'luxury', 'high-end', 'high end', 'pricey'],
    mid: ['mid-range', 'mid range', 'moderate', 'reasonable']
};

// Quality/Rating patterns
const QUALITY_PATTERNS = {
    best: ['best', 'top', 'top rated', 'highest rated', 'excellent', 'outstanding'],
    good: ['good', 'quality', 'reliable', 'solid', 'decent']
};

// Time/newness patterns
const TIME_PATTERNS = {
    new: ['new', 'newest', 'latest', 'recent', '2026', '2025', '2024'],
    old: ['old', 'used', 'refurbished', 'pre-owned', 'second hand', 'secondhand']
};

// Availability patterns
const AVAILABILITY_PATTERNS = {
    in_stock: ['in stock', 'available', 'ready', 'ready to ship', 'immediate']
};

/**
 * Parse search query and extract intent
 */
function parseQuery(query, existingFilters = {}) {
    const original = query;
    let cleanQuery = query.toLowerCase();
    const extractedFilters = { ...existingFilters };
    const tokens = [];

    // 1. Extract currency and price ranges
    const priceExtraction = extractPriceRanges(cleanQuery);
    if (priceExtraction) {
        Object.assign(extractedFilters, priceExtraction.filters);
        cleanQuery = priceExtraction.cleanQuery;
        tokens.push(...priceExtraction.tokens);
    }

    // 2. Extract price indicators (cheap, expensive, etc.)
    const priceIndicator = extractPriceIndicator(cleanQuery);
    if (priceIndicator) {
        extractedFilters.price_indicator = priceIndicator.indicator;
        cleanQuery = priceIndicator.cleanQuery;
        tokens.push(priceIndicator.token);
    }

    // 3. Extract quality/rating intent
    const qualityIntent = extractQualityIntent(cleanQuery);
    if (qualityIntent) {
        extractedFilters.sort = qualityIntent.sort;
        cleanQuery = qualityIntent.cleanQuery;
        tokens.push(qualityIntent.token);
    }

    // 4. Extract time/newness intent
    const timeIntent = extractTimeIntent(cleanQuery);
    if (timeIntent) {
        extractedFilters.time_preference = timeIntent.preference;
        if (timeIntent.sort) extractedFilters.sort = timeIntent.sort;
        cleanQuery = timeIntent.cleanQuery;
        tokens.push(timeIntent.token);
    }

    // 5. Extract availability intent
    const availabilityIntent = extractAvailabilityIntent(cleanQuery);
    if (availabilityIntent) {
        extractedFilters.in_stock_only = true;
        cleanQuery = availabilityIntent.cleanQuery;
        tokens.push(availabilityIntent.token);
    }

    // Clean up query (remove extra spaces, trim)
    cleanQuery = cleanQuery.replace(/\s+/g, ' ').trim();

    return {
        original_query: original,
        clean_query: cleanQuery || original, // fallback to original if completely stripped
        filters: extractedFilters,
        extracted_tokens: tokens,
        has_filters: tokens.length > 0
    };
}

/**
 * Extract price ranges from query
 * Patterns: "under 500", "less than 500", "from 100 to 500", "between 100 and 500", "500-1000"
 */
function extractPriceRanges(query) {
    const filters = {};
    const tokens = [];
    let cleanQuery = query;

    // Currency detection
    const currencyMatch = query.match(/(euro|euros|eur|€|dollar|dollars|usd|\$|pound|pounds|gbp|£)/i);
    const currency = currencyMatch ? detectCurrency(currencyMatch[1]) : 'EUR';

    // Pattern 1: "under X", "below X", "less than X", "max X"
    const underMatch = query.match(/(?:under|below|less than|max|maximum|up to)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
    if (underMatch) {
        const amount = parseFloat(underMatch[1].replace(/,/g, ''));
        filters.price_max_cents = Math.round(amount * 100);
        filters.currency = currency;
        cleanQuery = cleanQuery.replace(underMatch[0], '');
        tokens.push({ type: 'price_max', value: amount, currency });
    }

    // Pattern 2: "over X", "above X", "more than X", "min X"
    const overMatch = query.match(/(?:over|above|more than|min|minimum|starting from)\s+(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
    if (overMatch) {
        const amount = parseFloat(overMatch[1].replace(/,/g, ''));
        filters.price_min_cents = Math.round(amount * 100);
        filters.currency = currency;
        cleanQuery = cleanQuery.replace(overMatch[0], '');
        tokens.push({ type: 'price_min', value: amount, currency });
    }

    // Pattern 3: "from X to Y", "between X and Y", "X-Y", "X to Y"
    const rangeMatch = query.match(/(?:from|between)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:to|-|and)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
    if (rangeMatch && !underMatch && !overMatch) {
        const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
        const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
        filters.price_min_cents = Math.round(min * 100);
        filters.price_max_cents = Math.round(max * 100);
        filters.currency = currency;
        cleanQuery = cleanQuery.replace(rangeMatch[0], '');
        tokens.push({ type: 'price_range', min, max, currency });
    }

    if (currencyMatch) {
        cleanQuery = cleanQuery.replace(currencyMatch[0], '');
    }

    return tokens.length > 0 ? { filters, cleanQuery, tokens } : null;
}

/**
 * Extract price indicator (cheap, expensive, etc.)
 */
function extractPriceIndicator(query) {
    for (const [indicator, patterns] of Object.entries(PRICE_PATTERNS)) {
        for (const pattern of patterns) {
            const regex = new RegExp(`\\b${pattern}\\b`, 'i');
            if (regex.test(query)) {
                return {
                    indicator,
                    cleanQuery: query.replace(regex, ''),
                    token: { type: 'price_indicator', value: indicator }
                };
            }
        }
    }
    return null;
}

/**
 * Extract quality/rating intent
 */
function extractQualityIntent(query) {
    for (const [quality, patterns] of Object.entries(QUALITY_PATTERNS)) {
        for (const pattern of patterns) {
            const regex = new RegExp(`\\b${pattern}\\b`, 'i');
            if (regex.test(query)) {
                return {
                    quality,
                    sort: 'rating_desc',
                    cleanQuery: query.replace(regex, ''),
                    token: { type: 'quality', value: quality }
                };
            }
        }
    }
    return null;
}

/**
 * Extract time/newness intent
 */
function extractTimeIntent(query) {
    for (const [preference, patterns] of Object.entries(TIME_PATTERNS)) {
        for (const pattern of patterns) {
            const regex = new RegExp(`\\b${pattern}\\b`, 'i');
            if (regex.test(query)) {
                return {
                    preference,
                    sort: preference === 'new' ? 'newest_first' : null,
                    cleanQuery: query.replace(regex, ''),
                    token: { type: 'time', value: preference }
                };
            }
        }
    }
    return null;
}

/**
 * Extract availability intent
 */
function extractAvailabilityIntent(query) {
    for (const [status, patterns] of Object.entries(AVAILABILITY_PATTERNS)) {
        for (const pattern of patterns) {
            const regex = new RegExp(`\\b${pattern}\\b`, 'i');
            if (regex.test(query)) {
                return {
                    status,
                    cleanQuery: query.replace(regex, ''),
                    token: { type: 'availability', value: status }
                };
            }
        }
    }
    return null;
}

/**
 * Detect currency from text
 */
function detectCurrency(text) {
    const t = text.toLowerCase();
    if (t.includes('euro') || t.includes('eur') || t.includes('€')) return 'EUR';
    if (t.includes('dollar') || t.includes('usd') || t.includes('$')) return 'USD';
    if (t.includes('pound') || t.includes('gbp') || t.includes('£')) return 'GBP';
    return 'EUR'; // default
}

/**
 * Generate human-readable filter labels for UI chips
 */
function generateFilterLabels(filters) {
    const labels = [];

    if (filters.price_max_cents) {
        const amount = filters.price_max_cents / 100;
        const currency = filters.currency || 'EUR';
        labels.push({
            type: 'price_max',
            label: `Under ${formatCurrency(amount, currency)}`,
            value: filters.price_max_cents,
            removable: true
        });
    }

    if (filters.price_min_cents && !filters.price_max_cents) {
        const amount = filters.price_min_cents / 100;
        const currency = filters.currency || 'EUR';
        labels.push({
            type: 'price_min',
            label: `Over ${formatCurrency(amount, currency)}`,
            value: filters.price_min_cents,
            removable: true
        });
    }

    if (filters.price_min_cents && filters.price_max_cents) {
        const min = filters.price_min_cents / 100;
        const max = filters.price_max_cents / 100;
        const currency = filters.currency || 'EUR';
        labels.push({
            type: 'price_range',
            label: `${formatCurrency(min, currency)} - ${formatCurrency(max, currency)}`,
            value: { min: filters.price_min_cents, max: filters.price_max_cents },
            removable: true
        });
    }

    if (filters.price_indicator) {
        const indicatorLabels = {
            cheap: 'Budget-Friendly',
            expensive: 'Premium',
            mid: 'Mid-Range'
        };
        labels.push({
            type: 'price_indicator',
            label: indicatorLabels[filters.price_indicator] || filters.price_indicator,
            value: filters.price_indicator,
            removable: true
        });
    }

    if (filters.sort === 'rating_desc') {
        labels.push({
            type: 'sort',
            label: 'Best Rated',
            value: 'rating_desc',
            removable: true
        });
    }

    if (filters.in_stock_only) {
        labels.push({
            type: 'availability',
            label: 'In Stock',
            value: true,
            removable: true
        });
    }

    return labels;
}

/**
 * Format currency amount
 */
function formatCurrency(amount, currency) {
    const symbols = { EUR: '€', USD: '$', GBP: '£' };
    const symbol = symbols[currency] || currency;
    return `${symbol}${amount.toLocaleString()}`;
}

module.exports = {
    parseQuery,
    generateFilterLabels
};
