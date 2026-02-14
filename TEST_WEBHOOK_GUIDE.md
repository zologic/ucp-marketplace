# Testing Webhook Endpoint

## Problem Identified

Diagnostic shows:
- ✅ 22 checkout sessions created (users clicking "Buy Now")
- ❌ 0 orders (no webhooks received)
- ✅ Merchants verified (have public_key)
- ❌ No webhook logs (no requests arriving)

**Conclusion:** Merchant WordPress plugin is not sending webhooks.

## Quick Test: Does Webhook Endpoint Work?

### Step 1: Test with Manual Script

From the server:

```bash
cd /workspace/cmlkoklmf0001impj6c6thsc5/ucp-marketplace

# Set merchant domain (use one of your verified merchants)
export MERCHANT_DOMAIN=test.zologic.nl
export WEBHOOK_URL=https://bizform.app/api/webhooks/order-completed

# Run test
node test-webhook.js
```

**Expected output if endpoint works:**
```
✓ Success!
Status: 200
Response: {
  "status": "ok",
  "order_id": 123
}
```

**If you get "Merchant not verified" error:**
- Check the MERCHANT_DOMAIN matches exactly what's in database
- Domain in database might be different (check: `SELECT domain FROM merchants;`)

**If you get "Connection refused":**
- API container not running
- Wrong URL
- Firewall blocking

### Step 2: Check What Domain Merchants Have

```bash
docker compose exec -T postgres psql -U postgres -d ucpready -c "
SELECT
    id,
    domain,
    status,
    public_key IS NOT NULL as has_public_key,
    business_name
FROM merchants;
"
```

Use the exact domain from this output in test-webhook.js

### Step 3: Update Merchant Public Key for Test

The test-webhook.js script generates a new keypair. You need to update the merchant's public_key in the database with the one shown in the output:

```bash
# Run test script first to see the public key
node test-webhook.js

# It will output something like:
# Public Key (base64): ABC123...XYZ789
#
# Paste this into merchants.public_key in database:
# UPDATE merchants SET public_key = 'ABC123...XYZ789' WHERE domain = 'test.zologic.nl';

# Copy the UPDATE statement from output and run it:
docker compose exec -T postgres psql -U postgres -d ucpready -c "
UPDATE merchants SET public_key = 'PASTE_KEY_HERE' WHERE domain = 'test.zologic.nl';
"

# Then run test again:
node test-webhook.js
```

**If test succeeds:** Webhook endpoint works! Problem is merchant plugin configuration.

**If test fails:** Webhook endpoint has an issue that needs debugging.

## Merchant Plugin Configuration

### Required: WordPress Plugin Setup

The merchant (test.zologic.nl) needs to:

1. **Install UCPReady WordPress Plugin**
   - Download from your plugin repository
   - Upload to WordPress: Plugins → Add New → Upload Plugin
   - Activate plugin

2. **Configure Webhook URL**
   - WooCommerce → Settings → UCPReady tab
   - Set "Webhook URL": `https://bizform.app/api/webhooks/order-completed`
   - Save settings

3. **Verify Plugin Activation**
   - The plugin should hook into WooCommerce order completion
   - When an order status changes to "completed", it sends webhook
   - Check plugin is active: Plugins → Installed Plugins → UCPReady (should show "Active")

### Plugin Requirements

The plugin must:
- ✅ Hook WooCommerce `woocommerce_order_status_completed` action
- ✅ Extract order data: order_id, total, currency
- ✅ Extract referral_id from order meta (stored during checkout)
- ✅ Sign payload with merchant's private key
- ✅ Send POST request to webhook URL with signature

### Common Plugin Issues

**Issue: referral_id not included in webhook**
- Plugin not storing referral_id from checkout URL
- Check if plugin captures `?ucp_ref=` parameter during checkout
- referral_id should be saved as order meta

**Issue: Signature verification fails**
- Plugin using wrong private key
- Public key in database doesn't match plugin's private key
- Solution: Re-verify merchant to fetch correct public key from UCP manifest

**Issue: Webhook not triggered**
- Plugin not activated
- WooCommerce hooks not firing
- Order status not changing to "completed"
- Check WordPress logs for errors

## Debugging Merchant Plugin

### Check if Merchant Stores referral_id

When user completes checkout, the return URL includes `?ref={referralId}`:
```
https://test.zologic.nl/checkout/order-received/123/?ref=cd656f5c-0be4-44ba-abc2-05d7e7c91585
```

The plugin must:
1. Capture this `ref` parameter
2. Store it in order meta: `update_post_meta($order_id, '_ucp_referral_id', $referral_id)`
3. Include it in webhook payload

### Check Merchant's Plugin Logs

On merchant's WordPress site:
```bash
# Enable WordPress debug logging
wp-config.php:
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);

# Check logs
tail -f /path/to/wordpress/wp-content/debug.log
```

Look for:
- `[UCPReady] Sending webhook for order 123`
- `[UCPReady] Webhook sent successfully`
- Any error messages

### Check if Orders Complete on Merchant Site

The webhook only fires when order status = "completed":
- Some payment methods auto-complete (bank transfer might not)
- Admin might need to manually mark order as complete
- Check WooCommerce → Orders on merchant site

## Next Steps

1. **Test webhook endpoint works:** `node test-webhook.js`
2. **Contact merchant:** Configure WordPress plugin with webhook URL
3. **Place test order:** Complete full checkout flow
4. **Check API logs:** Should see webhook request arrive
5. **Verify order created:** Run diagnostic script again

## Expected Flow After Fix

```
User clicks "Buy Now"
  ↓
Checkout session created (referral_id: ABC-123)
  ✅ Already working (22 sessions created)
  ↓
User redirected to merchant checkout with return URL
  ✅ Already working
  ↓
User completes purchase on merchant site
  ↓
Merchant WooCommerce order created (status: completed)
  ↓
UCPReady plugin triggers on order completion
  ❌ NOT HAPPENING - plugin not configured
  ↓
Plugin sends webhook to marketplace:
  POST /api/webhooks/order-completed
  Body: {order_id, merchant_domain, referral_id, total_cents, currency, signature}
  ↓
Marketplace webhook handler:
  - Verifies signature ✅
  - Creates order record ✅
  - Updates checkout session status to "completed" ✅
  - Calculates commission ✅
  - Creates billable event ✅
  ↓
Analytics shows conversion ✅
```

Currently stuck at: **Plugin not sending webhook**

## Contact Merchant

Send to test.zologic.nl admin:

> Hi,
>
> We've set up the marketplace integration and verified your store. To complete the integration, you need to configure the UCPReady WordPress plugin to send order webhooks.
>
> **Setup Instructions:**
> 1. Install the UCPReady WordPress plugin (if not already installed)
> 2. Go to: WooCommerce → Settings → UCPReady
> 3. Set "Webhook URL" to: `https://bizform.app/api/webhooks/order-completed`
> 4. Save settings
>
> After this is configured, when customers complete purchases that came from our marketplace, we'll receive notifications and track the sales correctly.
>
> Let us know if you need any help with the plugin setup!

---

## Additional Diagnostics

### Check Recent Checkout Sessions

```sql
SELECT
    referral_id,
    session_url,
    created_at
FROM checkout_sessions
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 5;
```

Pick one referral_id and manually construct webhook test for it.

### Check If Any Orders Exist (Even Without referral_id)

```sql
SELECT COUNT(*) as total_orders FROM orders;
```

If > 0: Orders can be created, webhook endpoint works
If = 0: This is first time trying to create orders

### Monitor for Webhook Arrivals

```bash
# In one terminal, watch API logs
docker compose logs -f api | grep webhook

# In another terminal, complete a test order on merchant site
# Should see webhook request appear in logs
```
