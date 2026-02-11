# Embedded Checkout - Implementation Guide

## Overview

The UCP Marketplace now supports **both redirect-based and embedded checkout modes**. This gives merchants flexibility in how they present their checkout experience:

- **Redirect Mode** (traditional): User is redirected to merchant's checkout page
- **Embedded Mode** (new): Merchant's checkout loads in an iframe within the marketplace

The system automatically detects which mode to use based on the merchant's UCP manifest.

## How It Works

### 1. Merchant Configuration

Merchants indicate embedded checkout support in their UCP manifest (`/.well-known/ucp`):

```json
{
  "capabilities": [
    {
      "name": "dev.ucp.shopping.embedded_checkout",
      "supported": true,
      "endpoint": "https://merchant.com/embed/checkout"
    }
  ]
}
```

### 2. Backend Detection

**File:** `api/routes/public.js`

When a checkout session is created, the backend:
1. Checks merchant's `ucp_manifest.capabilities` for `dev.ucp.shopping.embedded_checkout`
2. If supported, uses the merchant's embedded checkout endpoint
3. Returns `embedded_checkout: true` in the response

```javascript
// Example response for embedded checkout
{
  "checkout_url": "https://merchant.com/embed/checkout?ref=abc123",
  "referral_id": "abc123",
  "session_id": "sess_123456",
  "embedded_checkout": true  // Tells frontend to use iframe
}
```

### 3. Frontend Handling

**Files:** `frontend/js/checkout.js`, `frontend/js/embedded-checkout.js`

The checkout handler checks the `embedded_checkout` flag:

```javascript
if (data.embedded_checkout) {
    // Show in iframe
    showEmbeddedCheckout(data.checkout_url, data.referral_id);
} else {
    // Traditional redirect
    showCheckoutRedirect(data.checkout_url);
}
```

## PostMessage Communication

The marketplace and merchant communicate via `postMessage` API.

### Messages from Marketplace → Merchant

**1. ec.marketplace.ready**
Sent when iframe loads to indicate marketplace is ready.

```javascript
{
  type: 'ec.marketplace.ready',
  referralId: 'abc123'
}
```

### Messages from Merchant → Marketplace

**1. ec.ready**
Merchant signals it's ready for interaction.

```javascript
{
  type: 'ec.ready'
}
```

**2. ec.resize**
Request iframe height adjustment.

```javascript
{
  type: 'ec.resize',
  data: {
    height: 600  // Pixels
  }
}
```

**3. ec.checkout.complete**
Checkout completed successfully.

```javascript
{
  type: 'ec.checkout.complete',
  data: {
    orderId: 'ORD-12345',
    amount: 10000,
    currency: 'EUR'
  }
}
```

**4. ec.checkout.cancelled**
User cancelled the checkout.

```javascript
{
  type: 'ec.checkout.cancelled'
}
```

**5. ec.checkout.error**
Error occurred during checkout.

```javascript
{
  type: 'ec.checkout.error',
  data: {
    message: 'Payment failed',
    code: 'PAYMENT_ERROR'
  }
}
```

## Merchant Implementation Example

Here's how a merchant would implement embedded checkout support:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Embedded Checkout</title>
</head>
<body>
    <div id="checkout-form">
        <!-- Merchant's checkout form -->
    </div>

    <script>
    // Get referral ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const referralId = urlParams.get('ref');

    // Signal ready to marketplace
    window.parent.postMessage({
        type: 'ec.ready'
    }, '*');

    // Listen for marketplace messages
    window.addEventListener('message', (event) => {
        if (event.data.type === 'ec.marketplace.ready') {
            console.log('Marketplace is ready');
        }
    });

    // When checkout completes
    function onCheckoutComplete(orderId) {
        window.parent.postMessage({
            type: 'ec.checkout.complete',
            data: {
                orderId: orderId,
                amount: 10000,
                currency: 'EUR'
            }
        }, '*');
    }

    // When user cancels
    function onCheckoutCancel() {
        window.parent.postMessage({
            type: 'ec.checkout.cancelled'
        }, '*');
    }

    // When error occurs
    function onCheckoutError(message) {
        window.parent.postMessage({
            type: 'ec.checkout.error',
            data: {
                message: message,
                code: 'PAYMENT_ERROR'
            }
        }, '*');
    }
    </script>
</body>
</html>
```

## Security Considerations

### iframe Sandbox

The embedded checkout iframe uses restrictive sandbox attributes:

```html
<iframe
    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
    allow="payment"
    src="...">
</iframe>
```

**Allowed:**
- JavaScript execution (`allow-scripts`)
- Form submission (`allow-forms`)
- Popups for payment providers (`allow-popups`)
- Payment Request API (`payment`)

**Restricted:**
- Top-level navigation (cannot redirect parent page)
- Downloads
- Fullscreen
- Pointer lock

### Origin Validation

In production, the marketplace should validate `event.origin` in the postMessage handler:

```javascript
function setupMessageHandler(referralId, iframe) {
    return function(event) {
        // Validate origin matches merchant domain
        const merchantDomain = new URL(iframe.src).origin;
        if (event.origin !== merchantDomain) {
            console.warn('Invalid message origin:', event.origin);
            return;
        }

        // Process message
        // ...
    };
}
```

### Content Security Policy

The marketplace should set appropriate CSP headers:

```
Content-Security-Policy: frame-ancestors 'none';
```

This prevents the marketplace itself from being embedded in other sites.

## User Experience

### Embedded Mode Advantages
- Seamless experience (no page reload)
- Faster perceived performance
- Marketplace branding remains visible
- Better mobile experience

### Redirect Mode Advantages
- Full merchant branding
- No iframe restrictions
- Works with older payment providers
- Simpler implementation

### User Controls

**Close Button:** Top-right X button closes iframe
**ESC Key:** Pressing ESC closes iframe
**Background Click:** Clicking outside iframe closes it

All closures are treated as cancellations.

## Backward Compatibility

The system is **fully backward compatible**:

- Merchants without embedded checkout capability use redirect mode
- Existing redirect-based flows work exactly as before
- No changes required for merchants who don't want embedded checkout
- All UCP compliance tests still pass

## Testing

### Test Embedded Checkout

1. **Mock Merchant Setup:**
   Add embedded checkout capability to merchant's UCP manifest

2. **Test Flow:**
   - Search for product
   - Select variations
   - Click "Buy"
   - Verify iframe appears
   - Verify postMessage communication
   - Test completion/cancellation/error flows

3. **Test Controls:**
   - Close button
   - ESC key
   - Background click
   - Mobile responsive behavior

### Test Messages

```javascript
// Simulate merchant sending completion message
window.postMessage({
    type: 'ec.checkout.complete',
    data: { orderId: 'TEST-123' }
}, '*');
```

## Configuration

No additional configuration needed. The system automatically:
- Detects embedded checkout support from merchant manifest
- Chooses appropriate mode
- Handles all communication

## Monitoring

### Metrics to Track

- **Embedded vs Redirect Split:** Percentage of checkouts using each mode
- **Completion Rate by Mode:** Compare embedded vs redirect success rates
- **Iframe Load Time:** Monitor embedded checkout performance
- **Error Rate by Mode:** Track errors in embedded checkouts

### Logging

Key events logged:
- `[EmbeddedCheckout] Merchant checkout ready`
- `[EmbeddedCheckout] Checkout completed`
- `[EmbeddedCheckout] Checkout cancelled`
- `[EmbeddedCheckout] Checkout error`
- `[EmbeddedCheckout] Unknown message type`

## Troubleshooting

### Iframe Not Loading

**Symptoms:** White screen or loading indicator doesn't disappear

**Causes:**
- CORS/CSP issues
- Merchant endpoint not responding
- X-Frame-Options header blocking embed

**Solution:** Check browser console for errors, verify merchant's embedded endpoint

### Messages Not Received

**Symptoms:** postMessage communication fails

**Causes:**
- Origin mismatch
- Merchant not sending messages
- Message format incorrect

**Solution:** Check console logs, verify message structure

### Close Button Not Working

**Symptoms:** Iframe stays open

**Causes:**
- Event listener not attached
- CSS z-index issues

**Solution:** Verify event handlers, check element stacking

## Future Enhancements

Potential additions (not currently implemented):

1. **Payment Method Selection:** Pass preferred payment method to merchant
2. **Address Prefill:** Send user's saved address to merchant
3. **Multi-Step Tracking:** Track checkout funnel within iframe
4. **Analytics Integration:** Send analytics events from embedded checkout
5. **Session Persistence:** Resume interrupted checkouts
6. **Progressive Rendering:** Show checkout stages progressively

---

**Version:** 1.0.0
**Date:** 2026-02-11
**Status:** Production Ready
