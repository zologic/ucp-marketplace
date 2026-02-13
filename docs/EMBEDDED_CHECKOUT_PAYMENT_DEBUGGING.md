# Embedded Checkout - Payment Fields Not Rendering

## Problem

Payment methods appear in the embedded checkout, but when you select a payment method (e.g., Credit Card), the payment form fields don't render.

## Common Causes

### 1. Payment Gateway Scripts Not Loading

**Symptoms:**
- Payment method radio buttons visible
- No input fields for card number, expiry, CVV
- Browser console shows script errors

**Check:**
```javascript
// In browser console on the embedded checkout page (inside iframe)
console.log('Stripe loaded:', typeof Stripe !== 'undefined');
console.log('PayPal loaded:', typeof paypal !== 'undefined');
```

**Fix for WooCommerce:**

Ensure payment gateway scripts are enqueued on the checkout page:

```php
// In your plugin or theme
add_action('wp_enqueue_scripts', function() {
    if (is_checkout()) {
        // Force load payment gateway assets
        do_action('woocommerce_review_order_before_payment');
    }
});
```

### 2. DOM Events Not Firing

**Symptoms:**
- Payment method changes but form doesn't update
- Console shows: "jQuery is not defined" or similar

**Cause:** WooCommerce checkout uses jQuery events that may not fire in iframe context.

**Fix:**

Manually trigger payment method selection events:

```javascript
// In your ECP handler (after ec.ready handshake)
jQuery(document.body).on('change', 'input[name="payment_method"]', function() {
    var selectedMethod = jQuery(this).val();
    console.log('Payment method selected:', selectedMethod);

    // Trigger WooCommerce update
    jQuery(document.body).trigger('update_checkout');
    jQuery(document.body).trigger('payment_method_selected');
});
```

### 3. CSP/CORS Blocking External Scripts

**Symptoms:**
- Console error: "Refused to load script from 'https://js.stripe.com/v3/'"
- Console error: "Blocked by Content Security Policy"

**Check:**

View HTTP headers:
```bash
curl -I https://test.zologic.nl/checkout/session_123
```

Look for `Content-Security-Policy` or `X-Frame-Options` headers.

**Fix:**

Add CSP meta tag or headers allowing payment gateway domains:

```php
// In your embedded checkout template
add_action('wp_head', function() {
    if (is_embedded_checkout()) {
        ?>
        <meta http-equiv="Content-Security-Policy" content="
            default-src 'self';
            script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.paypal.com;
            frame-src 'self' https://js.stripe.com https://www.paypal.com;
            connect-src 'self' https://api.stripe.com https://www.paypal.com;
            style-src 'self' 'unsafe-inline';
        ">
        <?php
    }
}, 1);
```

### 4. Stripe Elements Not Mounting

**Symptoms:**
- Stripe.js loads successfully
- But card input fields don't appear
- Console: "IntegrationError: Please call Stripe() with your publishable key"

**Fix:**

Ensure Stripe is initialized with your publishable key:

```javascript
// Check Stripe initialization
if (typeof Stripe !== 'undefined') {
    console.log('Stripe loaded');

    // Initialize if not already done
    if (!window.stripeInstance) {
        window.stripeInstance = Stripe('pk_test_YOUR_KEY');
        console.log('Stripe initialized');
    }
} else {
    console.error('Stripe.js not loaded!');
}
```

### 5. WooCommerce Checkout Block Not Rendering

**Symptoms:**
- Using WooCommerce Blocks
- Payment methods show but no payment fields

**Fix:**

The checkout block needs specific initialization:

```javascript
// Wait for WooCommerce checkout to be ready
if (window.wc && window.wc.wcBlocksRegistry) {
    // Checkout blocks are loaded
    console.log('WooCommerce Blocks detected');

    // Force re-render payment methods
    const checkoutStore = window.wp.data.select('wc/store/checkout');
    const paymentMethods = checkoutStore.getPaymentMethods();
    console.log('Available payment methods:', paymentMethods);
} else {
    // Classic checkout
    console.log('WooCommerce Classic Checkout');
}
```

### 6. Missing `allow-modals` in iframe sandbox

**Symptoms:**
- 3D Secure authentication doesn't open
- PayPal login popup blocked

**Marketplace Fix:**

The marketplace iframe needs these sandbox attributes:

```javascript
iframe.setAttribute('sandbox',
    'allow-same-origin ' +
    'allow-scripts ' +
    'allow-forms ' +
    'allow-popups ' +
    'allow-popups-to-escape-sandbox ' +
    'allow-top-navigation-by-user-activation ' +
    'allow-modals'
);

iframe.allow = 'payment; publickey-credentials-get';
```

### 7. Credentialless Mode Blocking Cookies

**Symptoms:**
- Payment form loads but submission fails
- Session lost between page loads
- Console: "Failed to fetch" or CORS errors

**Cause:** `credentialless` iframe attribute blocks cookies.

**Marketplace Fix:**

Remove `credentialless` attribute for payment flows:

```javascript
// DON'T do this for payment checkouts:
// iframe.setAttribute('credentialless', 'true');

// Payment gateways need cookies for session management
```

## Complete Diagnostic Checklist

### In Browser Console (Inside Iframe)

```javascript
// 1. Check jQuery
console.log('jQuery:', typeof jQuery !== 'undefined' ? jQuery.fn.jquery : 'NOT LOADED');

// 2. Check WooCommerce
console.log('WC Checkout:', typeof wc_checkout_params !== 'undefined' ? 'LOADED' : 'NOT LOADED');

// 3. Check Stripe
console.log('Stripe:', typeof Stripe !== 'undefined' ? 'LOADED' : 'NOT LOADED');

// 4. Check PayPal
console.log('PayPal:', typeof paypal !== 'undefined' ? 'LOADED' : 'NOT LOADED');

// 5. Check payment method fields
console.log('Payment fields:', jQuery('.payment_box').length, 'found');

// 6. Check if payment method is selected
console.log('Selected method:', jQuery('input[name="payment_method"]:checked').val());

// 7. Check for console errors
console.log('Check console for any red errors above this line');

// 8. Test manual trigger
jQuery('input[name="payment_method"]:first').prop('checked', true).trigger('change');
```

### Expected Output (Working)

```
jQuery: 3.6.0
WC Checkout: LOADED
Stripe: LOADED
PayPal: LOADED
Payment fields: 2 found
Selected method: stripe
```

### Expected Output (Broken)

```
jQuery: NOT LOADED        ← Problem: Scripts not loading
WC Checkout: NOT LOADED   ← Problem: WooCommerce not initialized
Stripe: NOT LOADED        ← Problem: Payment gateway scripts blocked
Payment fields: 0 found   ← Problem: Payment UI not rendered
```

## Quick Fixes

### Fix 1: Force Load All Checkout Assets

```php
// In your plugin's embedded checkout template
add_action('wp_enqueue_scripts', function() {
    // Force load WooCommerce checkout scripts
    wp_enqueue_script('wc-checkout');
    wp_enqueue_script('woocommerce');

    // Force load payment gateway scripts
    $gateways = WC()->payment_gateways->get_available_payment_gateways();
    foreach ($gateways as $gateway) {
        if (method_exists($gateway, 'payment_scripts')) {
            $gateway->payment_scripts();
        }
    }
}, 999);
```

### Fix 2: Manually Initialize Payment Forms

```javascript
// After ec.ready handshake completes
jQuery(document).ready(function($) {
    // Wait for WooCommerce checkout to load
    setTimeout(function() {
        // Trigger payment method change for first method
        var $firstMethod = $('input[name="payment_method"]:first');
        if ($firstMethod.length) {
            $firstMethod.prop('checked', true).trigger('change');
            console.log('Payment method initialized:', $firstMethod.val());
        }

        // Trigger checkout update
        $(document.body).trigger('update_checkout');
    }, 1000);
});
```

### Fix 3: Add Console Logging

```javascript
// Add extensive logging to debug
jQuery(document.body).on('payment_method_selected', function() {
    console.log('[ECP] Payment method selected event fired');
    console.log('[ECP] Payment boxes:', jQuery('.payment_box').length);
    jQuery('.payment_box').each(function() {
        console.log('[ECP] Payment box HTML:', $(this).html().substring(0, 100));
    });
});
```

## Testing Steps

1. **Open browser DevTools** (F12)
2. **Go to Console tab**
3. **Click "Buy Now"** on marketplace
4. **Wait for iframe to load**
5. **Switch console context** to the iframe:
   - Chrome: Select iframe from dropdown at top of console
   - Firefox: Click iframe icon in console toolbar
6. **Run diagnostic script** (from checklist above)
7. **Try selecting payment method**
8. **Watch for errors**

## Contact Info

If payment fields still don't render after trying these fixes:

1. Share browser console output (all errors)
2. Share network tab (failed requests)
3. Share iframe URL
4. Share payment gateway (Stripe, PayPal, etc.)
