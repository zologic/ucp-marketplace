# Webhook Troubleshooting Guide

## Problem: Conversions Not Tracking (Zero Referral Conversions)

When conversions show 0 in analytics despite checkout sessions being created, this means webhooks are not successfully creating orders in the database.

## Root Causes Checklist

### 1. Merchants Not Verified ⚠️ **MOST COMMON**

**Symptom:** Webhooks return `400 Bad Request` with error "Merchant not verified"

**Root Cause:** Merchants don't have `public_key` in database

**Why it happens:**
- Merchant was added manually without running verification
- UCP manifest verification failed or was skipped
- Merchant's UCP endpoint was unreachable during verification

**Check:**
```sql
-- Check if merchants have public keys
SELECT
    id,
    domain,
    status,
    CASE
        WHEN public_key IS NULL THEN '✗ No public key'
        ELSE '✓ Has public key'
    END as verification_status
FROM merchants;
```

**Fix:**
1. Go to Admin Dashboard → Merchants
2. Click "Verify" button for each merchant
3. This fetches UCP manifest and extracts public_key
4. Webhook signature verification will now work

**OR via API:**
```bash
curl -X POST https://your-marketplace.com/admin/merchants/{merchant_id}/verify \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

### 2. Merchant Plugin Not Configured

**Symptom:** No webhook requests appearing in API logs

**Root Cause:** Merchant's WordPress plugin not configured to send webhooks

**Check:**
```bash
# Check API logs for incoming webhook requests
docker compose logs api | grep "POST /api/webhooks/order-completed"

# If no results, webhooks aren't being sent
```

**Fix (Merchant-side):**
1. Install UCPReady WordPress plugin on merchant site
2. Configure webhook URL: `https://your-marketplace.com/api/webhooks/order-completed`
3. Ensure plugin is activated
4. Test with a real order

**Plugin settings location:**
- WooCommerce → Settings → UCPReady tab
- Webhook URL field must point to your marketplace

---

### 3. Webhook Signature Verification Failing

**Symptom:** Webhooks arriving but returning `400 Bad Request` with "Invalid signature"

**Root Cause:**
- Merchant's public key in database doesn't match private key used by plugin
- Plugin using wrong signature format
- Request body being modified in transit (proxy, load balancer)

**Check API logs:**
```bash
docker compose logs api | grep "Invalid webhook signature"
```

**Fix:**
1. **Verify public key matches:**
   ```sql
   SELECT domain, public_key FROM merchants WHERE domain = 'problematic-merchant.com';
   ```
2. **Re-verify merchant:** This fetches fresh public key from UCP manifest
3. **Check plugin version:** Ensure merchant using UCP 2026 compatible plugin
4. **Test manually:**
   ```bash
   node test-webhook.js
   ```

---

### 4. Webhook Endpoint Not Accessible

**Symptom:** Merchant reports "Connection refused" or timeouts

**Root Cause:**
- Firewall blocking webhook endpoint
- API container not running
- Wrong webhook URL configured in merchant plugin

**Check:**
```bash
# Test webhook endpoint is accessible
curl -X POST https://your-marketplace.com/api/webhooks/order-completed \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Should return 400 with "Missing required fields" (not 404 or connection error)
```

**Fix:**
1. Ensure API container is running: `docker compose ps api`
2. Check nginx/reverse proxy configuration
3. Verify DNS and SSL certificates
4. Test from merchant's server (not localhost)

---

### 5. Checkout Sessions Created But No Referral ID

**Symptom:** Checkout sessions exist but webhook has no matching referral_id

**Root Cause:**
- Merchant plugin not passing referral_id back in webhook
- referral_id lost during checkout
- Old plugin version

**Check:**
```sql
-- Check recent checkout sessions
SELECT
    referral_id,
    status,
    created_at
FROM checkout_sessions
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Check if webhooks have matching referral_id
SELECT
    cs.referral_id,
    cs.status as session_status,
    o.id as order_id,
    CASE
        WHEN o.id IS NULL THEN '✗ No order'
        ELSE '✓ Order exists'
    END as webhook_received
FROM checkout_sessions cs
LEFT JOIN orders o ON o.referral_id = cs.referral_id
WHERE cs.created_at >= NOW() - INTERVAL '24 hours';
```

**Fix:**
1. Update merchant plugin to latest version
2. Ensure referral_id passed in checkout URL is stored
3. Verify plugin sends referral_id in webhook payload

---

## Diagnostic Scripts

### Quick Diagnostic

```bash
cd /workspace/cmlkoklmf0001impj6c6thsc5/ucp-marketplace
./diagnose-webhooks.sh
```

This checks:
- ✓ Checkout sessions status
- ✓ Orders with referral_id
- ✓ Pending sessions without orders
- ✓ Merchant verification status
- ✓ Recent API logs

### Manual Webhook Test

```bash
# Test webhook endpoint with mock data
export WEBHOOK_URL=https://your-marketplace.com/api/webhooks/order-completed
export MERCHANT_DOMAIN=test.zologic.nl

node test-webhook.js
```

This script:
1. Generates test keypair
2. Signs webhook payload
3. Sends to webhook endpoint
4. Shows response

**Expected output:**
```
✓ Success!
Status: 200
Response: {
  "status": "ok",
  "order_id": 123
}
```

---

## Step-by-Step Debugging Process

### Step 1: Verify Merchants

```sql
-- Check merchant verification status
SELECT
    domain,
    status,
    public_key IS NOT NULL as has_public_key,
    last_verified_at
FROM merchants;
```

**If has_public_key = false:**
→ **Run merchant verification in admin dashboard**

### Step 2: Check Checkout Flow

```sql
-- Check if checkout sessions are being created
SELECT COUNT(*) as total_sessions
FROM checkout_sessions
WHERE created_at >= NOW() - INTERVAL '24 hours';
```

**If 0 sessions:**
→ Frontend checkout is broken (separate issue)

**If >0 sessions:**
→ Checkout works, webhook is the problem

### Step 3: Check Webhook Delivery

```bash
# Check API logs for webhook requests
docker compose logs api --tail 100 | grep webhook
```

**If no webhook logs:**
→ Merchant plugin not sending webhooks (fix #2)

**If seeing "Merchant not verified":**
→ Run merchant verification (fix #1)

**If seeing "Invalid signature":**
→ Public key mismatch (fix #3)

**If seeing "Order already recorded":**
→ Webhooks ARE working! Check analytics date range

### Step 4: Check Orders Created

```sql
-- Check if orders are being created
SELECT
    COUNT(*) as total_orders,
    COUNT(referral_id) as with_referral_id,
    MAX(created_at) as latest_order
FROM orders;
```

**If total_orders = 0:**
→ Webhooks not successfully creating orders

**If with_referral_id = 0:**
→ Orders exist but not from webhooks (manual orders?)

**If latest_order is old:**
→ No recent webhook activity

### Step 5: Check Analytics Query

```sql
-- Same query as analytics endpoint
SELECT COUNT(*) as referral_conversions
FROM orders
WHERE referral_id IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days';
```

**If this returns 0 but orders exist with referral_id:**
→ Date range issue in analytics

**If this returns >0:**
→ Analytics should show conversions (cache issue?)

---

## Common Scenarios

### Scenario A: "Just added merchant, webhooks don't work"

**Solution:** Run merchant verification
1. Admin Dashboard → Merchants → [Click merchant]
2. Click "Verify" button
3. Wait for verification to complete
4. Test checkout flow again

### Scenario B: "Webhooks worked before, now they don't"

**Possible causes:**
- Merchant changed their UCP manifest
- Merchant changed their signing keys
- Merchant plugin was updated/reinstalled

**Solution:** Re-verify merchant to fetch fresh public key

### Scenario C: "Some merchants work, others don't"

**Solution:** Check verification status per merchant
```sql
SELECT domain, status, public_key IS NOT NULL as verified
FROM merchants;
```

Verify the merchants that don't have public_key set.

### Scenario D: "Checkout sessions created but no orders"

**Most likely:** Merchant plugin not configured or not sending webhooks

**Check merchant plugin settings:**
- Webhook URL correctly configured
- Plugin activated
- WooCommerce order completion hooks working

---

## Prevention

**When adding new merchants:**
1. ✅ Always run "Verify" after adding merchant
2. ✅ Test complete checkout flow with real order
3. ✅ Verify order appears in admin dashboard
4. ✅ Check analytics shows conversion

**Monitoring:**
```sql
-- Daily check: Conversion rate
SELECT
    DATE(created_at) as date,
    COUNT(DISTINCT cs.id) as checkout_sessions,
    COUNT(DISTINCT o.id) as completed_orders,
    ROUND(COUNT(DISTINCT o.id)::numeric / NULLIF(COUNT(DISTINCT cs.id), 0) * 100, 1) as conversion_rate
FROM checkout_sessions cs
LEFT JOIN orders o ON o.referral_id = cs.referral_id
WHERE cs.created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Healthy conversion rate:** 30-70% (depends on your flow)
**Low conversion rate (<10%):** Webhook issue

---

## Related Files

- `api/routes/webhooks.js` - Webhook handler
- `api/routes/admin.js` - Merchant verification (verifyMerchantUCP function)
- `test-webhook.js` - Manual testing script
- `diagnose-webhooks.sh` - Diagnostic script
- `WEBHOOK_FIX.md` - Recent bug fix documentation

---

## Contact Points

**If still having issues after following this guide:**

1. Check API logs in detail:
   ```bash
   docker compose logs api --tail 500 > api-logs.txt
   ```

2. Run full diagnostic:
   ```bash
   ./diagnose-webhooks.sh > webhook-diagnostic.txt
   ```

3. Export merchant and order data:
   ```sql
   \copy (SELECT * FROM merchants) TO 'merchants.csv' CSV HEADER;
   \copy (SELECT * FROM orders WHERE created_at >= NOW() - INTERVAL '7 days') TO 'orders.csv' CSV HEADER;
   \copy (SELECT * FROM checkout_sessions WHERE created_at >= NOW() - INTERVAL '7 days') TO 'checkout_sessions.csv' CSV HEADER;
   ```
