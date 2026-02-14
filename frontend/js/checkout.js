/**
 * Checkout Flow
 * Handles checkout session creation with support for redirect and embedded modes
 */

import { showLoading, hideLoading, renderError, showCheckoutRedirect } from './ui.js';
import { showEmbeddedCheckout } from './embedded-checkout.js';

/**
 * Handle checkout initiation
 * UPDATED: Server-side session IDs (removed client-side generation)
 * @param {string} merchantId - Merchant UUID
 * @param {string} productId - Product UUID
 * @param {Object} selectedVariations - Selected product variations (optional)
 */
export async function handleCheckout(merchantId, productId, selectedVariations = null) {
    showLoading();

    try {
        const apiBase = window.location.origin + '/api';

        // Capture referral source
        const tenantDomain = window.location.hostname; // e.g., "shoes.shopucp.eu"
        const referralSource = `UCP-${tenantDomain}`;

        const requestBody = {
            merchant_id: merchantId,
            product_id: productId,
            quantity: 1,
            referral_source: referralSource
            // DO NOT send session_id - server generates it
        };

        // Add variations if provided
        if (selectedVariations) {
            requestBody.selected_variations = selectedVariations;
        }

        const response = await fetch(`${apiBase}/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const data = await response.json();

            // Handle variation-specific errors
            if (data.code === 'VARIATIONS_REQUIRED') {
                throw new Error('Please select all product options');
            }
            if (data.code === 'VARIATION_MISSING') {
                throw new Error(data.error || 'Please select all options');
            }
            if (data.code === 'VARIATION_INVALID') {
                throw new Error('Invalid selection. Please choose different options.');
            }
            if (data.code === 'VARIATION_UNAVAILABLE') {
                throw new Error(data.error || 'Selected option is out of stock');
            }

            // Handle other error codes from server
            if (data.code === 'CLICK_RATE_LIMIT') {
                throw new Error(`Too many clicks. Please wait ${data.retryAfter} seconds.`);
            }

            if (data.code === 'DUPLICATE_SESSION') {
                throw new Error('You just clicked this product. Please wait a moment.');
            }

            if (response.status === 403) {
                throw new Error('This product is currently unavailable.');
            } else if (response.status === 404) {
                throw new Error('Product not found. It may no longer be available.');
            } else if (response.status === 400) {
                throw new Error(data.error || 'Product out of stock.');
            } else if (response.status === 429) {
                throw new Error(data.error || 'Rate limit exceeded. Please try again later.');
            } else {
                throw new Error('Unable to start checkout. Please try another option.');
            }
        }

        const data = await response.json();

        if (!data.checkout_url) {
            throw new Error('Invalid checkout response.');
        }

        // Store session_id for logging (read-only, not sent back to server)
        if (data.session_id) {
            sessionStorage.setItem('last_session_id', data.session_id);
        }

        // Always use redirect flow (embedded checkout disabled)
        hideLoading();

        // Store referral ID for potential return
        sessionStorage.setItem('checkout_ref', data.referral_id);

        // Redirect to merchant checkout
        window.location.href = data.checkout_url;

    } catch (error) {
        hideLoading();
        console.error('Checkout error:', error);

        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            renderError('Unable to connect. Please check your internet connection.');
        } else {
            renderError(error.message || 'Unable to start checkout. Please try again.');
        }
    }
}
