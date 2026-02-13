# Embedded Checkout - Merchant Implementation Guide

## Problem

When you open the embedded checkout modal and pass an order session through UCP, payment methods are not rendering. The console shows:

```
[ECP] Handshake failed: Error: ECP request timeout: ec.ready
```

## Root Cause

The marketplace uses **UCP 2026 Embedded Checkout Protocol (ECP)** which requires **JSON-RPC 2.0 format** for all messages. If your checkout page sends messages in the old simple format, they will be rejected.

## Solution

Your embedded checkout page MUST implement JSON-RPC 2.0 message handling.

## Required Implementation

### 1. Listen for marketplace messages

```javascript
window.addEventListener('message', (event) => {
    let message;
    try {
        message = JSON.parse(event.data);
    } catch (e) {
        return; // Not a valid JSON message
    }

    // Check if it's a JSON-RPC 2.0 request
    if (message.jsonrpc !== '2.0') {
        return;
    }

    // Handle different methods
    if (message.method === 'ec.ready') {
        handleEcReady(message, event.origin);
    }
});
```

### 2. Respond to ec.ready request

When the marketplace sends `ec.ready`, you MUST respond with a JSON-RPC 2.0 response:

```javascript
function handleEcReady(request, targetOrigin) {
    // Respond in JSON-RPC 2.0 format
    const response = {
        jsonrpc: '2.0',
        result: {
            ready: true,
            payment_methods: ['card', 'ideal', 'bancontact'], // Your available payment methods
            capabilities: {
                'payment.credential': true,
                'fulfillment.address_change': false
            }
        },
        id: request.id  // IMPORTANT: Must match the request ID
    };

    window.parent.postMessage(JSON.stringify(response), targetOrigin);
}
```

### 3. Send notifications for checkout events

When checkout completes, cancelled, or errors occur:

```javascript
// Checkout completed successfully
function notifyCheckoutComplete(orderId, amount, currency) {
    const notification = {
        jsonrpc: '2.0',
        method: 'ec.complete',
        params: {
            order_id: orderId,
            amount_cents: amount,
            currency: currency
        }
    };

    window.parent.postMessage(JSON.stringify(notification), '*');
}

// Checkout cancelled
function notifyCheckoutCancelled() {
    const notification = {
        jsonrpc: '2.0',
        method: 'ec.cancel',
        params: {}
    };

    window.parent.postMessage(JSON.stringify(notification), '*');
}

// Checkout error
function notifyCheckoutError(errorMessage) {
    const notification = {
        jsonrpc: '2.0',
        method: 'ec.error',
        params: {
            message: errorMessage,
            code: 'CHECKOUT_ERROR'
        }
    };

    window.parent.postMessage(JSON.stringify(notification), '*');
}
```

## Complete Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Embedded Checkout</title>
</head>
<body>
    <div id="checkout-container">
        <!-- Your checkout form here -->
        <h2>Complete Your Purchase</h2>
        <form id="payment-form">
            <div id="payment-methods">
                <!-- Payment method selection -->
            </div>
            <button type="submit">Pay Now</button>
            <button type="button" id="cancel-btn">Cancel</button>
        </form>
    </div>

    <script>
    // ==========================================
    // ECP (Embedded Checkout Protocol) Handler
    // ==========================================

    // Listen for messages from marketplace
    window.addEventListener('message', (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch (e) {
            return; // Not JSON
        }

        // Only accept JSON-RPC 2.0 messages
        if (message.jsonrpc !== '2.0') {
            return;
        }

        // Handle request methods
        if (message.method === 'ec.ready') {
            // Marketplace is asking if we're ready
            const response = {
                jsonrpc: '2.0',
                result: {
                    ready: true,
                    payment_methods: ['card', 'ideal'],
                    capabilities: {
                        'payment.credential': false, // Set to true if you support delegated payments
                        'fulfillment.address_change': false
                    }
                },
                id: message.id
            };

            window.parent.postMessage(JSON.stringify(response), event.origin);

            // Now render your payment methods
            renderPaymentMethods();
        }
    });

    // ==========================================
    // Your Checkout Logic
    // ==========================================

    function renderPaymentMethods() {
        // Show your payment form
        document.getElementById('payment-methods').innerHTML = `
            <div>
                <label><input type="radio" name="method" value="card" checked> Credit Card</label>
                <label><input type="radio" name="method" value="ideal"> iDEAL</label>
            </div>
        `;
    }

    // Handle form submission
    document.getElementById('payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            // Process payment with your payment provider
            const result = await processPayment();

            // Notify marketplace of success
            const notification = {
                jsonrpc: '2.0',
                method: 'ec.complete',
                params: {
                    order_id: result.orderId,
                    amount_cents: result.amount,
                    currency: 'EUR'
                }
            };

            window.parent.postMessage(JSON.stringify(notification), '*');
        } catch (error) {
            // Notify marketplace of error
            const notification = {
                jsonrpc: '2.0',
                method: 'ec.error',
                params: {
                    message: error.message,
                    code: 'PAYMENT_FAILED'
                }
            };

            window.parent.postMessage(JSON.stringify(notification), '*');
        }
    });

    // Handle cancellation
    document.getElementById('cancel-btn').addEventListener('click', () => {
        const notification = {
            jsonrpc: '2.0',
            method: 'ec.cancel',
            params: {}
        };

        window.parent.postMessage(JSON.stringify(notification), '*');
    });

    async function processPayment() {
        // Your payment processing logic here
        // Return { orderId, amount }
        return {
            orderId: 'ORD-' + Date.now(),
            amount: 1000 // cents
        };
    }
    </script>
</body>
</html>
```

## Testing Your Implementation

### 1. Open browser console on your embedded checkout page

### 2. Send a test ec.ready request from console

```javascript
window.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    method: 'ec.ready',
    params: {
        delegate: ['payment.credential']
    },
    id: 'test_1'
}), window.location.origin);
```

### 3. Check for response

You should see your page send back:

```javascript
{
    jsonrpc: '2.0',
    result: {
        ready: true,
        payment_methods: ['card', 'ideal']
    },
    id: 'test_1'
}
```

## Common Mistakes

### ❌ Wrong: Old format

```javascript
// This will be rejected
window.parent.postMessage({
    type: 'ec.ready'
}, '*');
```

### ✅ Correct: JSON-RPC 2.0 format

```javascript
// This will work
window.parent.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    result: { ready: true },
    id: request.id
}), '*');
```

### ❌ Wrong: Missing ID in response

```javascript
// Response without matching ID - will be ignored
{
    jsonrpc: '2.0',
    result: { ready: true }
    // Missing: id field
}
```

### ✅ Correct: ID matches request

```javascript
// Response with matching ID
{
    jsonrpc: '2.0',
    result: { ready: true },
    id: request.id  // Must match the request's ID
}
```

## WordPress/WooCommerce Plugin

If you're using WordPress/WooCommerce, add this to your embedded checkout page template:

```php
<script>
jQuery(document).ready(function($) {
    // ECP Message Handler
    window.addEventListener('message', function(event) {
        var message;
        try {
            message = JSON.parse(event.data);
        } catch (e) {
            return;
        }

        if (message.jsonrpc !== '2.0') return;

        if (message.method === 'ec.ready') {
            var response = {
                jsonrpc: '2.0',
                result: {
                    ready: true,
                    payment_methods: <?php echo json_encode(WC()->payment_gateways->get_available_payment_gateways()); ?>
                },
                id: message.id
            };

            window.parent.postMessage(JSON.stringify(response), event.origin);

            // Render WooCommerce checkout
            $('#checkout-container').show();
        }
    });

    // Hook into WooCommerce checkout complete event
    $(document.body).on('checkout_place_order_success', function(e, result) {
        var notification = {
            jsonrpc: '2.0',
            method: 'ec.complete',
            params: {
                order_id: result.order_id,
                amount_cents: result.total * 100,
                currency: '<?php echo get_woocommerce_currency(); ?>'
            }
        };

        window.parent.postMessage(JSON.stringify(notification), '*');
    });
});
</script>
```

## Need Help?

If payment methods still don't render:

1. Check browser console for ECP messages
2. Verify your response includes `jsonrpc: '2.0'`
3. Verify response `id` matches the request `id`
4. Ensure messages are JSON.stringify() before postMessage
5. Check CORS/CSP headers allow iframe embedding

## Security Notes

- Always validate `event.origin` before responding
- Never use `'*'` as target origin for sensitive data
- Implement CSRF protection on your payment endpoints
- Use HTTPS for all checkout pages
