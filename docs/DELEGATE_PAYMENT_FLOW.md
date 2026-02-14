# Delegate Payment Escalation Flow

## Overview

When a merchant only supports delegate payment methods (e.g., direct bank payment, cash on delivery), the checkout flow requires **escalation** to the merchant's site where the user completes payment.

The marketplace handles this by opening the merchant's **continue_url** in the **embedded checkout iframe** for a seamless user experience.

---

## Complete Flow

### 1. User Initiates Checkout

**Action:** User clicks "Buy Now" on marketplace
**Component:** `frontend/js/checkout.js` → `handleCheckout()`

```javascript
// User clicks Buy Now
handleCheckout(merchantId, productId, selectedVariations);
```

### 2. Marketplace Creates Checkout Session

**API Call:** `POST /api/checkout`
**File:** `api/routes/public.js` (lines 259-564)

```javascript
// Marketplace calls merchant's UCP API
POST {merchant_endpoint}/checkout
Headers:
  Content-Type: application/json
  Idempotency-Key: {referralId}
  UCP-Agent: BizForm/1.0
Body:
  {
    "line_items": [{
      "item": { "id": "{product_id}" },
      "quantity": 1
    }]
  }
```

### 3. Merchant Response: Requires Escalation

**Merchant API Response:**

```json
{
  "id": "checkout_abc123",
  "status": "requires_escalation",
  "continue_url": "https://merchant.com/checkout/payment/checkout_abc123",
  "line_items": [...],
  "payment_methods": {
    "delegate": [
      {
        "id": "bank_transfer",
        "title": "Direct Bank Transfer",
        "requires_escalation": true
      }
    ]
  }
}
```

**Why `requires_escalation`?**
- Only delegate payment methods are available
- Cannot be completed within embedded iframe
- User must visit merchant site to complete payment

### 4. Marketplace Detects Escalation

**File:** `api/routes/public.js` (lines 500-512)

```javascript
// Check for delegate payment escalation
if (session.status === 'requires_escalation' && session.continue_url) {
    // Open continue_url in embedded iframe
    checkoutUrl = session.continue_url;
    supportsEmbeddedCheckout = true;
    console.log(`[Checkout] Delegate payment escalation - using continue_url: ${checkoutUrl}`);
}
```

**API Response to Frontend:**

```json
{
  "checkout_url": "https://merchant.com/checkout/payment/checkout_abc123",
  "referral_id": "ref_xyz789",
  "session_id": "sess_1234567890_abcdef",
  "embedded_checkout": true  // ← Tells frontend to use iframe
}
```

### 5. Frontend Opens Embedded Iframe

**File:** `frontend/js/checkout.js` (lines 97-106)

```javascript
if (data.embedded_checkout) {
    // Open in embedded iframe (works for both standard and escalation URLs)
    showEmbeddedCheckout(data.checkout_url, data.referral_id);
}
```

**File:** `frontend/js/embedded-checkout.js`

```javascript
// Create iframe with continue_url
const iframe = document.createElement('iframe');
iframe.src = "https://merchant.com/checkout/payment/checkout_abc123";
iframe.setAttribute('sandbox',
    'allow-same-origin allow-scripts allow-forms allow-popups allow-modals'
);
```

### 6. ECP Handshake

**Merchant Page (inside iframe) initiates:**

```javascript
// Merchant sends ec.ready
window.parent.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    method: 'ec.ready',
    params: {
        delegate: ['payment.credential']
    },
    id: 'ready_1'
}), 'https://bizform.app');
```

**Marketplace responds:**

```javascript
// Marketplace acknowledges
window.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    result: {},
    id: 'ready_1'
}), 'https://merchant.com');
```

**File:** `frontend/js/embedded-checkout.js` (lines 226-303)

### 7. User Completes Delegate Payment

User interacts with merchant's payment page inside iframe:
1. Selects delegate payment method (e.g., "Direct Bank Transfer")
2. Receives payment instructions (bank account, reference number)
3. Clicks "Complete Order"

### 8. Merchant Notifies Completion

**Merchant sends ec.complete notification:**

```javascript
window.parent.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    method: 'ec.complete',
    params: {
        checkout: {
            id: 'checkout_abc123',
            status: 'completed',
            order: {
                id: 'order_456',
                permalink_url: 'https://merchant.com/order/order_456'
            }
        }
    }
}), 'https://bizform.app');
```

**File:** `frontend/js/embedded-checkout.js` (lines 316-345)

### 9. Marketplace Shows Success

**Handler:** `handleEcpComplete()`

```javascript
function handleEcpComplete(params) {
    closeEmbeddedCheckout();

    // Show success message
    showSuccessMessage({
        orderId: params.checkout.order.id,
        orderUrl: params.checkout.order.permalink_url
    });

    // Auto-reload after 5 seconds
    setTimeout(() => location.reload(), 5000);
}
```

---

## Key Implementation Details

### Why Continue URL in Embedded Iframe?

**Option 1: Redirect (Bad UX)**
```
User → Marketplace → Redirect to Merchant → Payment → Redirect back
```
- User leaves marketplace
- Loses context
- Confusing navigation

**Option 2: Embedded Iframe (Good UX)** ✅
```
User → Marketplace → [Merchant Iframe] → Payment → Success in Modal
```
- User stays on marketplace
- Seamless experience
- Clear flow

### Session Management

**Problem:** WooCommerce sessions don't persist cross-origin in iframes

**Solution (Merchant Side):**
```php
// Set SameSite=None for cookies
@ini_set('session.cookie_samesite', 'None');
@ini_set('session.cookie_secure', '1');

// Extend session timeout
add_filter('wc_session_expiring', function() { return 3600; }); // 1 hour
```

### Content Security Policy

**Problem:** CSP blocks payment scripts and iframe embedding

**Solution (Merchant Side):**
```php
header("Content-Security-Policy: " .
    "frame-ancestors 'self' https://bizform.app; " .
    "script-src 'self' 'unsafe-inline' blob: https://js.stripe.com; " .
    "worker-src 'self' blob:;"
);
```

---

## Error Handling

### Escalation Timeout

If user doesn't complete payment in iframe:

```javascript
// After 10 minutes, show timeout message
setTimeout(() => {
    if (checkoutStillOpen) {
        showTimeoutMessage();
        closeEmbeddedCheckout();
    }
}, 600000);
```

### Session Expired

If merchant session expires:

```javascript
// Merchant sends ec.error
window.parent.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    method: 'ec.error',
    params: {
        message: 'Checkout session expired',
        code: 'SESSION_EXPIRED'
    }
}), 'https://bizform.app');
```

**Marketplace handler:**
```javascript
function handleEcpError(params) {
    closeEmbeddedCheckout();
    renderError(params.message || 'Checkout error occurred');
}
```

### User Cancels

```javascript
// Merchant sends ec.cancel
window.parent.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    method: 'ec.cancel',
    params: {}
}), 'https://bizform.app');
```

---

## Testing Checklist

- [ ] Create checkout with delegate-only payment methods
- [ ] Verify API returns `requires_escalation` status
- [ ] Verify `continue_url` is present in response
- [ ] Verify iframe opens with `continue_url`
- [ ] Verify ECP handshake succeeds (check console for `[ECP] Handshake successful`)
- [ ] Verify user can complete delegate payment in iframe
- [ ] Verify `ec.complete` notification closes modal and shows success
- [ ] Verify `ec.cancel` notification closes modal gracefully
- [ ] Verify `ec.error` notification shows error message
- [ ] Verify session persists throughout flow (no "session expired" errors)

---

## Debugging

### Check API Response

```javascript
// In browser console
fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        merchant_id: 'xxx',
        product_id: 'yyy',
        quantity: 1
    })
})
.then(r => r.json())
.then(d => console.log('API Response:', d));
```

**Look for:**
- `"embedded_checkout": true`
- `"checkout_url"` contains `continue_url` from merchant

### Check ECP Messages

```javascript
// Monitor all ECP messages
window.addEventListener('message', (event) => {
    try {
        const msg = JSON.parse(event.data);
        if (msg.jsonrpc === '2.0') {
            console.log('[ECP]', msg.method || 'response', msg);
        }
    } catch (e) {}
});
```

**Expected sequence:**
1. `[ECP] ec.ready` (from merchant)
2. `[ECP] response` (marketplace acknowledges)
3. `[ECP] ec.complete` (after payment)

### Check Session Cookies

In DevTools → Application → Cookies → `merchant.com`:
- `wp_woocommerce_session_*` → Should have `SameSite=None; Secure`
- If missing, session will expire immediately

---

## Related Documentation

- **EMBEDDED_CHECKOUT_STATUS.md** - Current implementation status
- **EMBEDDED_CHECKOUT_PAYMENT_DEBUGGING.md** - Payment field rendering issues
- **EMBEDDED_CHECKOUT_MERCHANT_IMPLEMENTATION.md** - Merchant ECP integration guide
