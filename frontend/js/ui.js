/**
 * UI Manipulation
 * All DOM updates and rendering
 */

import { handleCheckout } from './checkout.js';

/**
 * Render search results
 * @param {Array} products - Array of product objects
 */
export function renderResults(products) {
    const container = document.getElementById('results-container');
    const section = document.getElementById('results-section');

    container.innerHTML = '';

    if (products.length === 0) {
        container.innerHTML = '<p class="no-results">No results found. Try a different search.</p>';
        section.classList.remove('hidden');
        return;
    }

    products.forEach(product => {
        const card = createProductCard(product);
        container.appendChild(card);
    });

    section.classList.remove('hidden');
}

/**
 * Create a product card element
 * @param {Object} product - Product data
 * @returns {HTMLElement} Product card element
 */
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';

    const imageSrc = product.image_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f5f5f5" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" font-family="Arial" font-size="16" fill="%23999" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';

    card.innerHTML = `
        <img src="${imageSrc}" alt="${escapeHtml(product.name)}" class="product-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f5f5f5%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'" />
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <p class="product-price">${formatPrice(product.price_cents, product.currency)}</p>
        <p class="product-merchant">${escapeHtml(product.merchant_name || 'Merchant')}</p>
        <button class="buy-button" data-merchant="${product.merchant_id}" data-product="${product.id}">
            Buy
        </button>
    `;

    const button = card.querySelector('.buy-button');
    button.addEventListener('click', () => {
        handleCheckout(product.merchant_id, product.id);
    });

    return card;
}

/**
 * Format price with currency symbol
 * @param {number} cents - Price in cents
 * @param {string} currency - Currency code
 * @returns {string} Formatted price
 */
function formatPrice(cents, currency) {
    const major = (cents / 100).toFixed(2);
    const symbols = {
        'EUR': '€',
        'USD': '$',
        'GBP': '£'
    };
    const symbol = symbols[currency] || currency;
    return `${symbol}${major}`;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show loading spinner
 */
export function showLoading() {
    const loading = document.getElementById('loading');
    loading.classList.remove('hidden');
}

/**
 * Hide loading spinner
 */
export function hideLoading() {
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
}

/**
 * Render error message
 * @param {string} message - Error message
 */
export function renderError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

/**
 * Clear error message
 */
export function clearError() {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = '';
    errorDiv.classList.add('hidden');
}

/**
 * Show checkout redirect message
 * @param {string} url - Checkout URL
 */
export function showCheckoutRedirect(url) {
    const message = document.createElement('div');
    message.className = 'loading';
    message.innerHTML = '<p>Redirecting to secure checkout...</p>';
    document.body.appendChild(message);

    setTimeout(() => {
        window.location.href = url;
    }, 500);
}
