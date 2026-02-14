# Embedded Checkout - Current Status & Troubleshooting

## ✅ Marketplace-Side Implementation (COMPLETE)

All required marketplace changes have been implemented and verified:

### 1. ECP Protocol Compliance ✅
**File:** `frontend/js/embedded-checkout.js`

- **Handshake Direction** (lines 87-94): Correctly waits for merchant to initiate `ec.ready` request
- **JSON-RPC 2.0** (lines 174-178): All messages validated for proper format
- **Message Handling** (lines 220-279): Full support for all ECP methods

### 1a. Delegate Payment Escalation Support ✅
**Files:** `api/routes/public.js` (lines 500-512), `frontend/js/checkout.js` (lines 97-106)

- **API Layer**: Detects `requires_escalation` status with `continue_url` from merchant
- **Frontend**: Opens `continue_url` in embedded iframe for seamless delegate payment
- **ECP Integration**: Uses standard ECP flow for payment completion notifications

### 2. Iframe Security for Payment Gateways ✅
**File:** `frontend/js/embedded-checkout.js` (lines 44-65)

```javascript
// Correct sandbox permissions
iframe.setAttribute('sandbox',
    'allow-same-origin ' +           // ✅ Cookies/session support
    'allow-scripts ' +                // ✅ Payment gateway scripts
    'allow-forms ' +                  // ✅ Form submission
    'allow-popups ' +                 // ✅ 3DS, PayPal popups
    'allow-popups-to-escape-sandbox ' + // ✅ Payment redirects
    'allow-top-navigation-by-user-activation ' + // ✅ Payment flows
    'allow-modals'                    // ✅ Payment modals
);

// ✅ credentialless mode DISABLED (payment gateways need cookies)
```

### 3. Dashboard Statistics ✅
**File:** `api/routes/admin-extended.js` (lines 514-527)

- Queries real-time tables (`search_events`, `checkout_sessions`, `orders`)
- No longer dependent on unpopulated `merchant_daily_stats` table

## ⏳ Merchant-Side Requirements (PENDING)

The merchant plugin needs these fixes to complete the integration:

### Required Fix #1: Content Security Policy (CSP) 🔴 CRITICAL

**Problem:** CSP headers are blocking:
- WordPress emoji loader (`blob:` URLs)
- Stripe.js scripts (`https://js.stripe.com`)
- PayPal scripts (`https://www.paypal.com`)
- Payment gateway initialization (`'unsafe-eval'`)

**Console Error:**
```
Creating a worker from 'blob:https://test.zologic.nl/...' violates the following Content Security Policy directive
```

**Required Fix** (in merchant plugin):

```php
// In your plugin's embedded checkout template or functions.php
add_action('send_headers', function() {
    if (is_page('checkout') && isset($_GET['ec_version'])) {
        header("Content-Security-Policy: " .
            "default-src 'self'; " .
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: " .
                "https://js.stripe.com " .
                "https://www.paypal.com " .
                "https://cdn.jsdelivr.net; " .
            "frame-src 'self' https://js.stripe.com https://www.paypal.com https://hooks.stripe.com; " .
            "connect-src 'self' https://api.stripe.com https://www.paypal.com; " .
            "worker-src 'self' blob:; " .
            "style-src 'self' 'unsafe-inline';"
        );
    }
});
```

**Alternative:** Remove CSP header entirely for embedded checkout pages:

```php
add_action('send_headers', function() {
    if (is_page('checkout') && isset($_GET['ec_version'])) {
        // Don't send CSP header for embedded checkout
        header_remove('Content-Security-Policy');
    }
});
```

### Required Fix #2: Disable WordPress Emoji Loader 🟡 RECOMMENDED

**Problem:** WordPress emoji loader creates workers that:
- Violate CSP (if strict CSP is used)
- Are unnecessary in embedded checkout
- Add page load overhead

**Required Fix:**

```php
// Disable emoji scripts on embedded checkout page
add_action('init', function() {
    if (is_page('checkout') && isset($_GET['ec_version'])) {
        remove_action('wp_head', 'print_emoji_detection_script', 7);
        remove_action('wp_print_styles', 'print_emoji_styles');
    }
});
```

### Required Fix #3: ECP Handshake Implementation ✅ DONE (verify)

According to the merchant's commit history, this was already implemented. Please verify:

```javascript
// Merchant page should have this message handler
window.addEventListener('message', (event) => {
    let message;
    try {
        message = JSON.parse(event.data);
    } catch (e) {
        return;
    }

    if (message.jsonrpc !== '2.0') return;

    if (message.method === 'ec.ready') {
        // Respond to handshake
        const response = {
            jsonrpc: '2.0',
            result: {
                ready: true,
                payment_methods: ['card', 'ideal'], // Your available methods
                capabilities: {
                    'payment.credential': false,
                    'fulfillment.address_change': false
                }
            },
            id: message.id
        };
        window.parent.postMessage(JSON.stringify(response), event.origin);
    }
});
```

### Required Fix #4: Payment Gateway Script Loading 🟡 CHECK

Ensure payment gateway scripts are loaded properly:

```php
add_action('wp_enqueue_scripts', function() {
    if (is_page('checkout') && isset($_GET['ec_version'])) {
        // Force load WooCommerce checkout scripts
        wp_enqueue_script('wc-checkout');

        // Force load payment gateway scripts
        $gateways = WC()->payment_gateways->get_available_payment_gateways();
        foreach ($gateways as $gateway) {
            if (method_exists($gateway, 'payment_scripts')) {
                $gateway->payment_scripts();
            }
        }
    }
}, 999);
```

## 🧪 Testing Procedure

### Step 1: Verify Merchant Plugin Updates

On the merchant's WordPress installation:

```bash
# Check if CSP headers are sent
curl -I https://test.zologic.nl/checkout/?token=xxx&ec_version=2026-01-23

# Look for Content-Security-Policy header
# If present, verify it includes blob:, https://js.stripe.com, etc.
```

### Step 2: Browser Console Diagnostic

On the marketplace (bizform.app), open DevTools console and run:

```javascript
// Test embedded checkout modal
const buyButton = document.querySelector('.buy-now-button');
buyButton?.click();

// Wait for iframe to load, then switch console context to iframe
// (Chrome: Select iframe from dropdown at top of console)

// Inside iframe context, run:
console.log('=== Payment Gateway Check ===');
console.log('jQuery:', typeof jQuery !== 'undefined' ? jQuery.fn.jquery : 'NOT LOADED');
console.log('WooCommerce:', typeof wc_checkout_params !== 'undefined');
console.log('Stripe:', typeof Stripe !== 'undefined');
console.log('PayPal:', typeof paypal !== 'undefined');
console.log('Payment boxes:', jQuery('.payment_box').length);
console.log('Selected method:', jQuery('input[name="payment_method"]:checked').val());
```

**Expected Output (Working):**
```
jQuery: 3.6.0
WooCommerce: true
Stripe: true
PayPal: true
Payment boxes: 2
Selected method: stripe
```

**Expected Output (Broken):**
```
jQuery: NOT LOADED      ← Scripts not loading
WooCommerce: false      ← WooCommerce not initialized
Stripe: false           ← CSP blocking Stripe
Payment boxes: 0        ← Payment UI not rendered
```

### Step 3: ECP Message Flow Check

In marketplace console (parent window):

```javascript
// Monitor ECP messages
window.addEventListener('message', (event) => {
    try {
        const msg = JSON.parse(event.data);
        if (msg.jsonrpc === '2.0') {
            console.log('[ECP Monitor]', msg.method || 'response', msg);
        }
    } catch (e) {}
});

// Open checkout modal
document.querySelector('.buy-now-button')?.click();

// Watch for:
// 1. [ECP Monitor] ec.ready (from merchant → marketplace)
// 2. [ECP Monitor] response (marketplace → merchant, with result)
```

**Expected Flow:**
```
[ECP] Iframe loaded, waiting for merchant ec.ready...
[ECP] Received request: ec.ready { delegate: [...] }
[ECP] Handshake successful - merchant is ready with delegations: [...]
```

**Broken Flow:**
```
[ECP] Iframe loaded, waiting for merchant ec.ready...
(nothing else - merchant not sending ec.ready)
```

## 📊 Current Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Marketplace ECP Handler | ✅ Complete | All JSON-RPC 2.0 methods implemented |
| Iframe Security | ✅ Complete | Sandbox permissions for payment gateways |
| Dashboard Stats | ✅ Complete | Using real-time tables |
| Merchant CSP Headers | 🔴 **NEEDS FIX** | Blocking payment scripts |
| Merchant ECP Handshake | 🟡 **VERIFY** | Claimed fixed, needs testing |
| Merchant Payment Scripts | 🟡 **UNKNOWN** | Need to verify scripts load |

## 🎯 Next Steps

1. **Merchant plugin:** Deploy CSP fix (Required Fix #1)
2. **Merchant plugin:** Deploy emoji loader disable (Required Fix #2)
3. **Test:** Run browser console diagnostic (Step 2 above)
4. **Test:** Verify ECP message flow (Step 3 above)
5. **Report:** Share results to identify remaining issues

## 📚 Reference Documentation

- **EMBEDDED_CHECKOUT_PAYMENT_DEBUGGING.md** - Complete troubleshooting guide
- **EMBEDDED_CHECKOUT_MERCHANT_IMPLEMENTATION.md** - Merchant integration guide
- **UCP 2026 ECP Specification** - Official protocol documentation

## 🆘 Common Issues

### Issue: "Payment methods visible but no form fields"
**Likely Cause:** CSP blocking payment gateway scripts
**Fix:** Required Fix #1 (CSP headers)

### Issue: "Handshake timeout"
**Likely Cause:** Merchant not sending ec.ready or using wrong format
**Fix:** Required Fix #3 (ECP handshake implementation)

### Issue: "Console errors about workers/blob:"
**Likely Cause:** WordPress emoji loader violating CSP
**Fix:** Required Fix #2 (disable emoji loader) OR update CSP to allow blob:

### Issue: "Payment works on direct page but not in iframe"
**Likely Cause:** iframe sandbox restrictions
**Status:** ✅ Fixed on marketplace side (lines 54-62 in embedded-checkout.js)

## 📞 Support

If issues persist after applying all fixes:

1. Run browser console diagnostic (see Step 2)
2. Check Network tab for failed script loads
3. Check Console tab for CSP violation errors
4. Share complete console output + network tab screenshot
5. Provide iframe URL from modal (inspect iframe src attribute)
