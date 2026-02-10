/**
 * Checkout Flow
 * Handles checkout session creation and redirect
 */

import { showLoading, hideLoading, renderError, showCheckoutRedirect } from './ui.js';

/**
 * Handle checkout initiation
 * UPDATED: Server-side session IDs (removed client-side generation)
 * @param {string} merchantId - Merchant UUID
 * @param {string} productId - Product UUID
 */
export async function handleCheckout(merchantId, productId) {
    showLoading();

    try {
        const apiBase = window.location.origin + '/api';

        const response = await fetch(`${apiBase}/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                merchant_id: merchantId,
                product_id: productId,
                quantity: 1
                // DO NOT send session_id - server generates it
            })
        });

        if (!response.ok) {
            const data = await response.json();

            // Handle specific error codes from server
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

        // Show redirect message and redirect
        hideLoading();
        showCheckoutRedirect(data.checkout_url);

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
