/**
 * Embedded Checkout Handler
 * Manages iframe-based checkout for UCP-compliant merchants
 */

import { hideLoading, renderError } from './ui.js';

/**
 * Show embedded checkout in iframe
 * @param {string} checkoutUrl - Merchant's checkout URL
 * @param {string} referralId - Referral tracking ID
 */
export function showEmbeddedCheckout(checkoutUrl, referralId) {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'embedded-checkout-overlay';
    overlay.id = 'embedded-checkout-overlay';

    // Create iframe container
    const container = document.createElement('div');
    container.className = 'embedded-checkout-container';

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.className = 'embedded-checkout-close';
    closeButton.innerHTML = '&times;';
    closeButton.setAttribute('aria-label', 'Close checkout');

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.className = 'embedded-checkout-iframe';
    iframe.id = 'embedded-checkout-iframe';
    iframe.src = checkoutUrl;
    iframe.allow = 'payment';
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');

    // Create loading indicator
    const loading = document.createElement('div');
    loading.className = 'embedded-checkout-loading';
    loading.innerHTML = '<p>Loading secure checkout...</p>';

    // Assemble container
    container.appendChild(closeButton);
    container.appendChild(loading);
    container.appendChild(iframe);
    overlay.appendChild(container);

    // Add to DOM
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    // Setup message listener for postMessage communication
    const messageHandler = setupMessageHandler(referralId, iframe);
    window.addEventListener('message', messageHandler);

    // Handle iframe load
    iframe.addEventListener('load', () => {
        loading.style.display = 'none';
        iframe.style.display = 'block';

        // Send ready signal to merchant
        iframe.contentWindow.postMessage({
            type: 'ec.marketplace.ready',
            referralId: referralId
        }, '*');
    });

    // Handle close button
    closeButton.addEventListener('click', () => {
        closeEmbeddedCheckout();
        window.removeEventListener('message', messageHandler);
    });

    // Handle overlay click (close on background click)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeEmbeddedCheckout();
            window.removeEventListener('message', messageHandler);
        }
    });

    // Handle ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeEmbeddedCheckout();
            window.removeEventListener('message', messageHandler);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    hideLoading();
}

/**
 * Setup postMessage handler for iframe communication
 * @param {string} referralId - Referral tracking ID
 * @param {HTMLIFrameElement} iframe - Checkout iframe
 * @returns {Function} Message handler function
 */
function setupMessageHandler(referralId, iframe) {
    return function(event) {
        // Security: Verify message origin if needed
        // In production, you should validate event.origin matches merchant domain

        if (!event.data || typeof event.data !== 'object') {
            return;
        }

        const { type, status, data } = event.data;

        switch (type) {
            case 'ec.ready':
                // Merchant iframe is ready
                console.log('[EmbeddedCheckout] Merchant checkout ready');
                break;

            case 'ec.resize':
                // Merchant wants to resize iframe
                if (data && data.height) {
                    iframe.style.height = `${data.height}px`;
                }
                break;

            case 'ec.checkout.complete':
                // Checkout completed successfully
                console.log('[EmbeddedCheckout] Checkout completed', data);
                handleCheckoutComplete(data);
                break;

            case 'ec.checkout.cancelled':
                // User cancelled checkout
                console.log('[EmbeddedCheckout] Checkout cancelled');
                closeEmbeddedCheckout();
                renderError('Checkout was cancelled. You can try again.');
                break;

            case 'ec.checkout.error':
                // Error during checkout
                console.error('[EmbeddedCheckout] Checkout error', data);
                closeEmbeddedCheckout();
                renderError(data?.message || 'An error occurred during checkout. Please try again.');
                break;

            default:
                // Unknown message type
                console.log('[EmbeddedCheckout] Unknown message type:', type);
        }
    };
}

/**
 * Handle successful checkout completion
 * @param {Object} data - Completion data from merchant
 */
function handleCheckoutComplete(data) {
    closeEmbeddedCheckout();

    // Show success message
    const successDiv = document.createElement('div');
    successDiv.className = 'checkout-success';
    successDiv.innerHTML = `
        <div class="checkout-success-content">
            <h2>Order Complete!</h2>
            <p>Thank you for your purchase.</p>
            ${data?.orderId ? `<p class="order-id">Order ID: ${escapeHtml(data.orderId)}</p>` : ''}
            <button class="success-button" onclick="location.reload()">Continue Shopping</button>
        </div>
    `;
    document.body.appendChild(successDiv);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        successDiv.remove();
        location.reload();
    }, 5000);
}

/**
 * Close embedded checkout
 */
export function closeEmbeddedCheckout() {
    const overlay = document.getElementById('embedded-checkout-overlay');
    if (overlay) {
        overlay.remove();
    }
    document.body.style.overflow = ''; // Restore scrolling
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
