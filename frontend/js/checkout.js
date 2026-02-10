/**
 * Checkout Flow
 * Handles checkout session creation and redirect
 */

import { showLoading, hideLoading, renderError, showCheckoutRedirect } from './ui.js';

/**
 * Handle checkout initiation
 * @param {string} merchantId - Merchant UUID
 * @param {string} productId - Product UUID
 */
export async function handleCheckout(merchantId, productId) {
    showLoading();

    // Get or create session ID for deduplication
    let sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
        sessionId = generateSessionId();
        sessionStorage.setItem('session_id', sessionId);
    }

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
                quantity: 1,
                session_id: sessionId
            })
        });

        if (!response.ok) {
            if (response.status === 403) {
                throw new Error('This product is currently unavailable.');
            } else if (response.status === 404) {
                throw new Error('Product not found. It may no longer be available.');
            } else if (response.status === 400) {
                const data = await response.json();
                throw new Error(data.error || 'Product out of stock.');
            } else {
                throw new Error('Unable to start checkout. Please try another option.');
            }
        }

        const data = await response.json();

        if (!data.checkout_url) {
            throw new Error('Invalid checkout response.');
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

/**
 * Generate a unique session ID
 * @returns {string} Session ID
 */
function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
