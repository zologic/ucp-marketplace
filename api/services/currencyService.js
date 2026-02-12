const axios = require('axios');

// Supported currencies
const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD'];
const CACHE_TTL = 3600; // 1 hour in seconds

// Currency symbols
const CURRENCY_SYMBOLS = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$'
};

/**
 * Get exchange rate from one currency to another
 * @param {string} from - Source currency (e.g., 'EUR')
 * @param {string} to - Target currency (e.g., 'USD')
 * @param {object} redis - Redis client for caching
 * @returns {Promise<{success: boolean, rate?: number, error?: string}>}
 */
async function getExchangeRate(from, to, redis) {
    // Validate currencies
    if (!SUPPORTED_CURRENCIES.includes(from) || !SUPPORTED_CURRENCIES.includes(to)) {
        return {
            success: false,
            error: `Currency not supported. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`
        };
    }

    // Same currency = 1.0
    if (from === to) {
        return { success: true, rate: 1.0 };
    }

    const cacheKey = `rate:${from}:${to}`;

    try {
        // Try to get from cache if Redis is available
        if (redis) {
            const cachedRate = await redis.get(cacheKey);
            if (cachedRate) {
                return { success: true, rate: parseFloat(cachedRate), cached: true };
            }
        }

        // Fetch from API
        const response = await axios.get(
            `https://api.exchangerate-api.com/v4/latest/${from}`,
            { timeout: 5000 }
        );

        if (response.status !== 200 || !response.data || !response.data.rates) {
            throw new Error('Invalid API response');
        }

        const rate = response.data.rates[to];
        if (!rate) {
            return { success: false, error: `Exchange rate not found for ${from} to ${to}` };
        }

        // Cache the rate if Redis is available
        if (redis) {
            await redis.setEx(cacheKey, CACHE_TTL, rate.toString());
        }

        return { success: true, rate, cached: false };

    } catch (error) {
        console.error('[currencyService] Error fetching exchange rate:', error.message);

        // Try to return stale cache if available
        if (redis) {
            try {
                const staleRate = await redis.get(cacheKey);
                if (staleRate) {
                    console.warn('[currencyService] Using stale cache due to API error');
                    return { success: true, rate: parseFloat(staleRate), cached: true, stale: true };
                }
            } catch (cacheError) {
                // Ignore cache errors
            }
        }

        return {
            success: false,
            error: 'Currency service unavailable'
        };
    }
}

/**
 * Convert amount from one currency to another
 * @param {number} amountCents - Amount in cents
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @param {object} redis - Redis client
 * @returns {Promise<{success: boolean, amount_cents?: number, rate?: number, error?: string}>}
 */
async function convertAmount(amountCents, fromCurrency, toCurrency, redis) {
    const rateResult = await getExchangeRate(fromCurrency, toCurrency, redis);

    if (!rateResult.success) {
        return {
            success: false,
            error: rateResult.error
        };
    }

    const convertedCents = Math.round(amountCents * rateResult.rate);

    return {
        success: true,
        amount_cents: convertedCents,
        rate: rateResult.rate,
        from_currency: fromCurrency,
        to_currency: toCurrency
    };
}

/**
 * Get currency symbol
 */
function getCurrencySymbol(currency) {
    return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Format price with currency
 */
function formatPrice(amountCents, currency) {
    const symbol = getCurrencySymbol(currency);
    const amount = (amountCents / 100).toFixed(2);

    // Special formatting for JPY (no decimal places)
    if (currency === 'JPY') {
        return `¥${Math.round(amountCents / 100)}`;
    }

    return `${symbol}${amount}`;
}

module.exports = {
    getExchangeRate,
    convertAmount,
    getCurrencySymbol,
    formatPrice,
    SUPPORTED_CURRENCIES
};
