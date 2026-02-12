/**
 * UCP Embedded Checkout Protocol (ECP) Handler
 * Fully compliant with UCP 2026 ECP specification
 * Uses JSON-RPC 2.0 for all communication
 */

import { hideLoading, renderError } from './ui.js';

// ECP Configuration
const ECP_VERSION = '2026-01-23';
const ECP_DELEGATIONS = ['payment.credential', 'fulfillment.address_change'];

// Request ID counter for JSON-RPC
let requestIdCounter = 1;

// Pending JSON-RPC requests
const pendingRequests = new Map();

/**
 * Show embedded checkout in iframe with ECP support
 * @param {string} checkoutUrl - Merchant's checkout URL
 * @param {string} referralId - Referral tracking ID
 */
export function showEmbeddedCheckout(checkoutUrl, referralId) {
    // Build ECP-compliant URL with required parameters
    const ecpUrl = buildEcpUrl(checkoutUrl);

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

    // Create iframe with ECP security settings
    const iframe = document.createElement('iframe');
    iframe.className = 'embedded-checkout-iframe';
    iframe.id = 'embedded-checkout-iframe';
    iframe.src = ecpUrl;
    iframe.allow = 'payment';
    // ECP Security: sandbox with required permissions
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
    // ECP Security: credentialless mode (optional, for enhanced security)
    if ('credentialless' in HTMLIFrameElement.prototype) {
        iframe.setAttribute('credentialless', 'true');
    }

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

    // Setup ECP message handler
    const messageHandler = setupEcpMessageHandler(referralId, iframe, ecpUrl);
    window.addEventListener('message', messageHandler);

    // Handle iframe load - initiate ECP handshake
    iframe.addEventListener('load', () => {
        loading.style.display = 'none';
        iframe.style.display = 'block';

        // Initiate ECP handshake (ec.ready request)
        sendEcpRequest(iframe, ecpUrl, 'ec.ready', {
            delegate: ECP_DELEGATIONS
        }).then(result => {
            console.log('[ECP] Handshake successful:', result);
        }).catch(error => {
            console.error('[ECP] Handshake failed:', error);
        });
    });

    // Handle close button
    closeButton.addEventListener('click', () => {
        closeEmbeddedCheckout();
        window.removeEventListener('message', messageHandler);
        pendingRequests.clear();
    });

    // Handle overlay click (close on background click)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeEmbeddedCheckout();
            window.removeEventListener('message', messageHandler);
            pendingRequests.clear();
        }
    });

    // Handle ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeEmbeddedCheckout();
            window.removeEventListener('message', messageHandler);
            document.removeEventListener('keydown', escHandler);
            pendingRequests.clear();
        }
    };
    document.addEventListener('keydown', escHandler);

    hideLoading();
}

/**
 * Build ECP-compliant checkout URL with required parameters
 * @param {string} baseUrl - Base checkout URL
 * @returns {string} ECP URL with parameters
 */
function buildEcpUrl(baseUrl) {
    const url = new URL(baseUrl);
    url.searchParams.set('ec_version', ECP_VERSION);
    url.searchParams.set('ec_delegate', ECP_DELEGATIONS.join(','));
    // ec_auth parameter would be added here if authentication is needed
    return url.toString();
}

/**
 * Setup ECP message handler with JSON-RPC 2.0 support
 * @param {string} referralId - Referral tracking ID
 * @param {HTMLIFrameElement} iframe - Checkout iframe
 * @param {string} expectedOrigin - Expected origin URL for security
 * @returns {Function} Message handler function
 */
function setupEcpMessageHandler(referralId, iframe, expectedOrigin) {
    const expectedOriginUrl = new URL(expectedOrigin);
    const allowedOrigin = expectedOriginUrl.origin;

    return function(event) {
        // ECP Security: Origin validation
        if (event.origin !== allowedOrigin) {
            console.warn('[ECP] Rejected message from unauthorized origin:', event.origin);
            return;
        }

        if (!event.data || typeof event.data !== 'string') {
            return;
        }

        let message;
        try {
            message = JSON.parse(event.data);
        } catch (e) {
            console.warn('[ECP] Invalid JSON message:', event.data);
            return;
        }

        // Validate JSON-RPC 2.0 structure
        if (message.jsonrpc !== '2.0') {
            console.warn('[ECP] Invalid jsonrpc version:', message.jsonrpc);
            return;
        }

        // Handle JSON-RPC response (for requests we sent)
        if (message.id && (message.result !== undefined || message.error !== undefined)) {
            handleEcpResponse(message);
            return;
        }

        // Handle JSON-RPC notification or request (from merchant)
        if (message.method) {
            handleEcpNotificationOrRequest(message, iframe, expectedOrigin, referralId);
        }
    };
}

/**
 * Handle JSON-RPC response
 * @param {Object} message - JSON-RPC response message
 */
function handleEcpResponse(message) {
    const pending = pendingRequests.get(message.id);
    if (!pending) {
        console.warn('[ECP] Received response for unknown request ID:', message.id);
        return;
    }

    pendingRequests.delete(message.id);
    clearTimeout(pending.timeout);

    if (message.error) {
        pending.reject(new Error(`ECP Error: ${message.error.message} (code: ${message.error.code})`));
    } else {
        pending.resolve(message.result);
    }
}

/**
 * Handle JSON-RPC notification or request from merchant
 * @param {Object} message - JSON-RPC message
 * @param {HTMLIFrameElement} iframe - Checkout iframe
 * @param {string} targetOrigin - Target origin for postMessage
 * @param {string} referralId - Referral tracking ID
 */
function handleEcpNotificationOrRequest(message, iframe, targetOrigin, referralId) {
    const { method, params, id } = message;

    console.log(`[ECP] Received ${id ? 'request' : 'notification'}: ${method}`, params);

    switch (method) {
        case 'ec.start':
            // Lifecycle: Checkout started
            handleEcpStart(params);
            break;

        case 'ec.complete':
            // Lifecycle: Checkout completed
            handleEcpComplete(params);
            break;

        case 'ec.cancel':
            // Lifecycle: Checkout cancelled
            handleEcpCancel(params);
            break;

        case 'ec.error':
            // Error notification
            handleEcpError(params);
            break;

        case 'ec.payment.credential_request':
            // Delegation: Payment credential request
            if (id) {
                handlePaymentCredentialRequest(params, id, iframe, targetOrigin);
            }
            break;

        case 'ec.fulfillment.address_change_request':
            // Delegation: Address change request
            if (id) {
                handleAddressChangeRequest(params, id, iframe, targetOrigin);
            }
            break;

        case 'ec.payment.instruments_change':
            // Payment instruments changed
            handlePaymentInstrumentsChange(params);
            break;

        default:
            console.warn('[ECP] Unknown method:', method);
            if (id) {
                // Send error response for unknown methods
                sendEcpError(iframe, targetOrigin, id, -32601, 'Method not found');
            }
    }
}

/**
 * Handle ec.start notification
 * @param {Object} params - Start parameters
 */
function handleEcpStart(params) {
    console.log('[ECP] Checkout started:', params.checkout?.id);
    // Could update UI to show checkout has started
}

/**
 * Handle ec.complete notification
 * @param {Object} params - Completion parameters
 */
function handleEcpComplete(params) {
    const checkout = params.checkout;
    const order = checkout?.order;

    console.log('[ECP] Checkout completed:', order?.id);

    closeEmbeddedCheckout();

    // Show success message
    const successDiv = document.createElement('div');
    successDiv.className = 'checkout-success';
    successDiv.innerHTML = `
        <div class="checkout-success-content">
            <h2>Order Complete!</h2>
            <p>Thank you for your purchase.</p>
            ${order?.id ? `<p class="order-id">Order ID: ${escapeHtml(order.id)}</p>` : ''}
            ${order?.permalink_url ? `<p><a href="${escapeHtml(order.permalink_url)}" target="_blank">View Order</a></p>` : ''}
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
 * Handle ec.cancel notification
 * @param {Object} params - Cancellation parameters
 */
function handleEcpCancel(params) {
    console.log('[ECP] Checkout cancelled');
    closeEmbeddedCheckout();
    renderError('Checkout was cancelled. You can try again.');
}

/**
 * Handle ec.error notification
 * @param {Object} params - Error parameters
 */
function handleEcpError(params) {
    console.error('[ECP] Checkout error:', params);
    closeEmbeddedCheckout();
    renderError(params?.message || 'An error occurred during checkout. Please try again.');
}

/**
 * Handle payment credential request (delegation)
 * @param {Object} params - Request parameters
 * @param {string|number} id - Request ID
 * @param {HTMLIFrameElement} iframe - Checkout iframe
 * @param {string} targetOrigin - Target origin
 */
function handlePaymentCredentialRequest(params, id, iframe, targetOrigin) {
    console.log('[ECP] Payment credential requested');

    // In a real implementation, this would:
    // 1. Show native payment UI
    // 2. Collect payment credential from user
    // 3. Return credential to merchant

    // For now, return not_supported_error
    sendEcpError(iframe, targetOrigin, id, 'not_supported_error', 'Payment delegation not yet implemented');
}

/**
 * Handle address change request (delegation)
 * @param {Object} params - Request parameters
 * @param {string|number} id - Request ID
 * @param {HTMLIFrameElement} iframe - Checkout iframe
 * @param {string} targetOrigin - Target origin
 */
function handleAddressChangeRequest(params, id, iframe, targetOrigin) {
    console.log('[ECP] Address change requested');

    // In a real implementation, this would:
    // 1. Show native address selection UI
    // 2. Get address from user
    // 3. Return address to merchant

    // For now, return not_supported_error
    sendEcpError(iframe, targetOrigin, id, 'not_supported_error', 'Address delegation not yet implemented');
}

/**
 * Handle payment instruments change notification
 * @param {Object} params - Change parameters
 */
function handlePaymentInstrumentsChange(params) {
    console.log('[ECP] Payment instruments changed');
    // Could update UI if we're showing payment info
}

/**
 * Send JSON-RPC 2.0 request to embedded checkout
 * @param {HTMLIFrameElement} iframe - Target iframe
 * @param {string} targetOrigin - Target origin
 * @param {string} method - JSON-RPC method
 * @param {Object} params - Method parameters
 * @returns {Promise} Promise that resolves with result or rejects with error
 */
function sendEcpRequest(iframe, targetOrigin, method, params) {
    return new Promise((resolve, reject) => {
        const id = `req_${requestIdCounter++}`;
        const message = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: id
        };

        // Store pending request
        const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`ECP request timeout: ${method}`));
        }, 30000); // 30 second timeout

        pendingRequests.set(id, { resolve, reject, timeout });

        // Send message
        const targetOriginUrl = new URL(targetOrigin);
        iframe.contentWindow.postMessage(JSON.stringify(message), targetOriginUrl.origin);
    });
}

/**
 * Send JSON-RPC 2.0 response to embedded checkout
 * @param {HTMLIFrameElement} iframe - Target iframe
 * @param {string} targetOrigin - Target origin
 * @param {string|number} id - Request ID
 * @param {Object} result - Result object
 */
function sendEcpResponse(iframe, targetOrigin, id, result) {
    const message = {
        jsonrpc: '2.0',
        result: result,
        id: id
    };

    const targetOriginUrl = new URL(targetOrigin);
    iframe.contentWindow.postMessage(JSON.stringify(message), targetOriginUrl.origin);
}

/**
 * Send JSON-RPC 2.0 error response to embedded checkout
 * @param {HTMLIFrameElement} iframe - Target iframe
 * @param {string} targetOrigin - Target origin
 * @param {string|number} id - Request ID
 * @param {string|number} code - Error code
 * @param {string} message - Error message
 */
function sendEcpError(iframe, targetOrigin, id, code, message) {
    const errorMessage = {
        jsonrpc: '2.0',
        error: {
            code: code,
            message: message
        },
        id: id
    };

    const targetOriginUrl = new URL(targetOrigin);
    iframe.contentWindow.postMessage(JSON.stringify(errorMessage), targetOriginUrl.origin);
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
    pendingRequests.clear();
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
