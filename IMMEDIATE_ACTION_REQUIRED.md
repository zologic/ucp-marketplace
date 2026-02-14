# IMMEDIATE ACTION REQUIRED - Fix Zero Conversions

## What Was Wrong

**Root cause identified:** The marketplace was NOT registering its webhook URL with merchant plugins.

**Result:**
- Checkout sessions created ✓ (22 sessions)
- Merchants verified ✓ (2 merchants with public keys)
- Webhook endpoint working ✓
- **BUT:** Merchants didn't know where to send webhooks ❌
- **Result:** Zero orders, zero conversions

## What Was Fixed

Added automatic webhook registration during merchant verification:
1. Marketplace verifies merchant (gets UCP manifest, public key)
2. **NEW:** Marketplace calls merchant's MCP endpoint to register webhook URL
3. Merchant plugin stores: `bizform_app → https://bizform.app/api/webhooks/order-completed`
4. When orders complete, plugin sends webhooks to registered URL
5. Marketplace receives webhooks, creates orders, tracks conversions ✓

## Immediate Steps to Fix Production

### Step 1: Deploy the Fix

```bash
# Pull latest changes
cd ~/ucp-marketplace
git pull origin main

# Rebuild API container (includes webhook registration code)
docker compose build api

# Restart API
docker compose up -d api

# Verify API is healthy
docker compose ps api
```

### Step 2: Register Webhooks for Existing Merchants

You have 2 verified merchants. They need webhook registration:

**Option A: Re-verify in Admin Dashboard (Easiest)**

1. Go to: https://bizform.app/admin/merchants
2. For each merchant:
   - Click merchant name
   - Click "Verify" button
   - Wait for verification to complete
   - Check logs: Should see `[Merchant Verify] ✓ Registered webhook URL with merchant.com`

**Option B: Use API Endpoint (Faster for Multiple Merchants)**

```bash
# Get list of verified merchants
docker compose exec -T postgres psql -U postgres -d ucpready -c "
SELECT id, domain FROM merchants WHERE status = 'verified';
"

# For each merchant ID, register webhook:
curl -X POST https://bizform.app/admin/merchants/{MERCHANT_ID}/register-webhook \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"

# Example:
curl -X POST https://bizform.app/admin/merchants/1/register-webhook \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

curl -X POST https://bizform.app/admin/merchants/2/register-webhook \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Step 3: Verify Registration Succeeded

**Check API logs:**
```bash
docker compose logs api --tail 50 | grep -i "webhook registration"

# Should see:
# [Webhook Registration] ✓ Registered with test.zologic.nl
```

**Check merchant received registration (if you have access):**
```bash
# SSH to merchant server (test.zologic.nl)
wp eval '
$registry = new \UCPReady\CapabilityRegistry();
$platforms = $registry->get_registered_platforms();
print_r($platforms);
'

# Should show:
# Array (
#     [bizform_app] => Array (
#         [webhook_url] => https://bizform.app/api/webhooks/order-completed
#     )
# )
```

### Step 4: Test Complete Order Flow

1. **Place test order:**
   - Go to bizform.app
   - Click "Buy Now" on a product
   - Complete checkout on merchant site
   - Complete payment
   - Ensure order status = "completed"

2. **Check webhook arrived:**
   ```bash
   # Watch API logs in real-time
   docker compose logs -f api | grep webhook

   # After order completes, should see:
   # POST /api/webhooks/order-completed
   # [Webhook] ✓ Order recorded: ...
   ```

3. **Verify order created:**
   ```bash
   docker compose exec -T postgres psql -U postgres -d ucpready -c "
   SELECT
       id,
       referral_id,
       merchant_order_id,
       revenue_cents / 100.0 as revenue_eur,
       created_at
   FROM orders
   ORDER BY created_at DESC
   LIMIT 5;
   "
   ```

4. **Check analytics:**
   - Go to: https://bizform.app/admin/analytics
   - Referral Conversions should now show > 0

### Step 5: Monitor

```bash
# Run diagnostic to confirm everything working
./diagnose-webhooks.sh

# Should now show:
# - Checkout sessions: 22+ (was 22)
# - Orders: 1+ (was 0) ✓
# - Webhook logs: Present ✓
# - Conversions: > 0 ✓
```

## Expected Timeline

- **Deployment:** 2-3 minutes
- **Webhook registration:** 10 seconds per merchant
- **Test order:** 5-10 minutes
- **Total:** ~15 minutes to fix completely

## Verification Checklist

After completing steps above:

- [ ] API restarted with new code
- [ ] Webhook registration called for all verified merchants
- [ ] Registration logs show success
- [ ] Test order placed on merchant site
- [ ] Webhook received in API logs
- [ ] Order created in database with referral_id
- [ ] Analytics shows conversions > 0

## If Registration Fails

**Error: "Merchant has no service_base_url"**
- Merchant not properly verified
- Solution: Run full verification first

**Error: "CONNECTION_REFUSED"**
- Merchant server unreachable
- Solution: Check merchant site is online, verify plugin installed

**Error: "ENDPOINT_NOT_FOUND" (404)**
- Merchant plugin missing MCP endpoint
- Solution: Update merchant plugin to latest version with MCP support

## Environment Variable Check

Make sure PUBLIC_URL is set correctly:

```bash
# Check current value
grep PUBLIC_URL .env

# Should be:
PUBLIC_URL=https://bizform.app

# If not set, add it:
echo "PUBLIC_URL=https://bizform.app" >> .env

# Restart API to pick up change:
docker compose restart api
```

## For Future Merchants

Good news: This is now automatic!

When you add new merchants:
1. Click "Verify" in admin dashboard
2. Webhook registration happens automatically
3. No manual steps needed

## Success Criteria

You'll know it's working when:
1. ✅ Test order completes on merchant site
2. ✅ API logs show: `POST /api/webhooks/order-completed`
3. ✅ Database shows new order with referral_id
4. ✅ Analytics shows: `Referral Conversions: 1` (or more)

## Quick Test Command

After deployment and registration:

```bash
# All-in-one test
echo "=== Testing Webhook Flow ==="
echo "1. Orders before test:"
docker compose exec -T postgres psql -U postgres -d ucpready -c "SELECT COUNT(*) FROM orders;"

echo ""
echo "2. Now place a test order on merchant site..."
echo "   (Complete the order and wait 30 seconds)"
echo ""
read -p "Press Enter after order is completed..."

echo ""
echo "3. Orders after test:"
docker compose exec -T postgres psql -U postgres -d ucpready -c "SELECT COUNT(*) FROM orders;"

echo ""
echo "4. Recent orders:"
docker compose exec -T postgres psql -U postgres -d ucpready -c "
SELECT id, merchant_order_id, revenue_cents/100.0 as eur, created_at
FROM orders ORDER BY created_at DESC LIMIT 3;
"

echo ""
echo "5. Webhook logs:"
docker compose logs api --tail 20 | grep webhook
```

## Need Help?

If webhook registration fails or webhooks still not arriving after these steps:

1. Run full diagnostic: `./diagnose-webhooks.sh`
2. Check API logs: `docker compose logs api --tail 200`
3. Refer to: `WEBHOOK_TROUBLESHOOTING.md`
4. Check: `WEBHOOK_REGISTRATION.md` for detailed docs

---

**Bottom line:** Deploy the fix, re-verify merchants (or use registration endpoint), test an order. Conversions will start tracking.
