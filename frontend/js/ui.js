/**
 * UI Manipulation
 * All DOM updates and rendering
 */

import { handleCheckout } from './checkout.js';

// Auto-reset timer reference
let autoResetTimer = null;

/**
 * Render search results
 * @param {Array} products - Array of product objects
 */
export function renderResults(products) {
    const container = document.getElementById('results-container');
    const section = document.getElementById('results-section');
    const clearButton = document.getElementById('clear-button');

    // Clear any existing auto-reset timer
    if (autoResetTimer) {
        clearTimeout(autoResetTimer);
        autoResetTimer = null;
    }

    container.innerHTML = '';

    if (products.length === 0) {
        container.innerHTML = '<p class="no-results">No results found. Try a different search.</p>';
        section.classList.remove('hidden');

        // Show clear button when results are displayed (even if "No results")
        if (clearButton) {
            clearButton.classList.remove('hidden');
        }

        // Morph Search button to Clear button
        window.dispatchEvent(new CustomEvent('morphButtonToClear'));

        // Start 5-second auto-reset timer
        autoResetTimer = setTimeout(() => {
            // Clear input
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }

            // Hide clear button
            if (clearButton) {
                clearButton.classList.add('hidden');
            }

            // Trigger reset animation (center pill, hide results)
            const event = new CustomEvent('resetSearchState');
            window.dispatchEvent(event);
        }, 5000);

        return;
    }

    // Show clear button when results are displayed
    if (clearButton) {
        clearButton.classList.remove('hidden');
    }

    // Morph Search button to Clear button
    window.dispatchEvent(new CustomEvent('morphButtonToClear'));

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

    // Build description HTML if available (with truncation for mobile)
    // Descriptions are pre-sanitized during indexing, safe to render as HTML
    const descriptionHtml = product.description_short
        ? `<div class="product-description">${truncateDescription(product.description_short, 60, 120)}</div>`
        : '';

    // Build variations HTML if product has variations
    let variationsHtml = '';
    if (product.has_variations && product.variations && product.variations.length > 0) {
        variationsHtml = '<div class="product-variations">';
        for (const variation of product.variations) {
            variationsHtml += `<div class="variation-group">
                <label>${escapeHtml(variation.attribute)}:</label>
                <div class="variation-options">`;

            for (const option of variation.options) {
                const disabled = !option.available ? ' disabled' : '';
                const selected = option.available ? ' selected' : ''; // First available is selected by default
                variationsHtml += `<button class="variation-option${selected}"
                    data-attribute="${escapeHtml(variation.attribute)}"
                    data-value="${escapeHtml(option.value)}"
                    data-price-modifier="${option.price_modifier_cents || 0}"${disabled}>
                    ${escapeHtml(option.value)}
                </button>`;
            }

            variationsHtml += '</div></div>';
        }
        variationsHtml += '</div>';
    }

    card.innerHTML = `
        <img src="${imageSrc}" alt="${escapeHtml(product.name)}" class="product-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f5f5f5%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'" />
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        ${descriptionHtml}
        <p class="product-price" data-base-price="${product.price_cents}">${formatPrice(product.price_cents, product.currency)}</p>
        <p class="product-merchant">${escapeHtml(product.merchant_name || 'Merchant')}</p>
        ${variationsHtml}
        <button class="buy-button" data-merchant="${product.merchant_id}" data-product="${product.id}">
            Buy
        </button>
    `;

    // Store product data in card for variation handling
    card.dataset.productId = product.id;
    card.dataset.currency = product.currency;

    // Initialize default selections for variations
    if (product.has_variations && product.variations) {
        const defaultSelections = {};
        for (const variation of product.variations) {
            const firstAvailable = variation.options.find(opt => opt.available);
            if (firstAvailable) {
                defaultSelections[variation.attribute] = firstAvailable.value;
            }
        }
        card.dataset.selectedVariations = JSON.stringify(defaultSelections);

        // Set up variation selection handlers
        setupVariationHandlers(card, product);
    }

    const button = card.querySelector('.buy-button');
    button.addEventListener('click', () => {
        const selectedVariations = card.dataset.selectedVariations
            ? JSON.parse(card.dataset.selectedVariations)
            : null;
        handleCheckout(product.merchant_id, product.id, selectedVariations);
    });

    return card;
}

/**
 * Setup variation selection handlers
 * @param {HTMLElement} card - Product card element
 * @param {Object} product - Product data
 */
function setupVariationHandlers(card, product) {
    card.addEventListener('click', (e) => {
        if (e.target.classList.contains('variation-option') && !e.target.disabled) {
            const attribute = e.target.dataset.attribute;
            const value = e.target.dataset.value;

            // Update visual selection
            const group = e.target.closest('.variation-group');
            group.querySelectorAll('.variation-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            e.target.classList.add('selected');

            // Update stored selections
            const selections = card.dataset.selectedVariations
                ? JSON.parse(card.dataset.selectedVariations)
                : {};
            selections[attribute] = value;
            card.dataset.selectedVariations = JSON.stringify(selections);

            // Recalculate and update price
            updateCardPrice(card, product, selections);
        }
    });
}

/**
 * Update card price based on selected variations
 * @param {HTMLElement} card - Product card element
 * @param {Object} product - Product data
 * @param {Object} selections - Selected variation values
 */
function updateCardPrice(card, product, selections) {
    let finalPrice = parseInt(card.querySelector('.product-price').dataset.basePrice, 10);

    // Add price modifiers from selected variations
    for (const variation of product.variations) {
        const selectedValue = selections[variation.attribute];
        if (selectedValue) {
            const option = variation.options.find(opt => opt.value === selectedValue);
            if (option && option.price_modifier_cents) {
                finalPrice += option.price_modifier_cents;
            }
        }
    }

    // Update price display
    const priceElement = card.querySelector('.product-price');
    priceElement.textContent = formatPrice(finalPrice, product.currency);
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
 * Truncate text based on screen size
 * @param {string} text - Text to truncate
 * @param {number} mobileLimit - Character limit for mobile (default: 60)
 * @param {number} desktopLimit - Character limit for desktop (default: 120)
 * @returns {string} Truncated text with ellipsis if needed
 */
function truncateDescription(text, mobileLimit = 60, desktopLimit = 120) {
    if (!text) return '';

    const isMobile = window.innerWidth < 768;
    const limit = isMobile ? mobileLimit : desktopLimit;

    if (text.length <= limit) {
        return text;
    }

    // Find last complete word before limit
    const truncated = text.substring(0, limit);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > 0) {
        return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
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
