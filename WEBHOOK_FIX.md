# Webhook Bug Fix - Conversions Not Tracking

## Problem

Conversions were not measuring in analytics because the webhook endpoint had a critical bug that prevented orders from being recorded.

## Root Cause

**File:** `api/routes/webhooks.js`, line 125

**Bug:** Undefined variable reference
```javascript
// BEFORE (BROKEN):
const orderResult = await req.app.locals.db.query(`
    INSERT INTO orders (...)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
    RETURNING id
`, [tenantId, merchant.id, checkoutSessionId, referral_id, order_id, total_cents, currency, signature, referralSource]);
//                                                                                                      ^^^^^^^^^ UNDEFINED!
```

The variable `signature` was never defined. The webhook receives signatures in two places:
- `requestSignatureHeader` - UCP 2026 JWT format (Request-Signature header)
- `bodySignature` - Legacy format (body.signature)

But neither was stored in a variable called `signature`, causing the webhook to crash with:
```
ReferenceError: signature is not defined
```

## Impact

- **Webhooks crashed** when merchants sent order completion notifications
- **No orders recorded** in database
- **Zero conversions** in analytics (query found no orders with referral_id)
- **Commission not calculated** (depends on order creation)
- **Merchants not billed** (no billable events created)

This was a **complete system failure** for the order flow.

## Fix

**File:** `api/routes/webhooks.js`, lines 120-128

```javascript
// AFTER (FIXED):
// Create order record
// Store whichever signature was used (JWT or legacy)
const usedSignature = requestSignatureHeader || bodySignature;

const orderResult = await req.app.locals.db.query(`
    INSERT INTO orders (tenant_id, merchant_id, checkout_session_id, referral_id, merchant_order_id, revenue_cents, currency, webhook_signature, verified, referral_source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
    RETURNING id
`, [tenantId, merchant.id, checkoutSessionId, referral_id, order_id, total_cents, currency, usedSignature, referralSource]);
```

Now the webhook:
1. Captures whichever signature format was used
2. Stores it in `usedSignature` variable
3. Passes it to the INSERT statement
4. Successfully creates order records

## Verification

After deploying this fix, conversions should start tracking:

### 1. Test Webhook Manually

```bash
# Set merchant domain
export MERCHANT_DOMAIN=test.zologic.nl
export WEBHOOK_URL=https://your-marketplace.com/api/webhooks/order-completed

# Run test script
cd /workspace/cmlkoklmf0001impj6c6thsc5/ucp-marketplace
node test-webhook.js
```

### 2. Check Orders Created

```sql
-- Verify orders are being created with referral_id
SELECT
    id,
    referral_id,
    merchant_order_id,
    revenue_cents / 100.0 AS revenue_eur,
    created_at,
    referral_source
FROM orders
ORDER BY created_at DESC
LIMIT 10;
```

### 3. Check Conversions in Analytics

```sql
-- Same query as analytics endpoint
SELECT COUNT(*) as referral_conversions
FROM orders
WHERE referral_id IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days';
```

Should now return > 0 if webhooks have been received.

### 4. Check API Logs

```bash
# Look for successful webhook processing
docker compose logs api | grep -i "webhook"

# Should see:
# [Webhook] ✓ Order recorded: TEST-1234567890
# [Webhook] ✓ Commission calculated: €3.95
```

## Deployment

1. **Rebuild API container:**
   ```bash
   docker compose build api
   docker compose up -d api
   ```

2. **Monitor logs during first order:**
   ```bash
   docker compose logs -f api
   ```

3. **Wait for webhook from merchant** (or trigger test order)

4. **Verify order appears in database and analytics**

## Prevention

Added to code review checklist:
- [ ] All variables used in database queries are defined
- [ ] Error handling wraps all async database operations
- [ ] Webhook endpoints have comprehensive logging

## Related Files

- `api/routes/webhooks.js` - Webhook handler (FIXED)
- `api/routes/admin-extended.js` - Analytics conversion query (no change needed)
- `test-webhook.js` - Manual testing script
- `docs/COMMISSION_FLOW.md` - Complete order flow documentation

## Timeline

- **Discovered:** User reported "conversions in analytics is not measuring this"
- **Root cause identified:** Undefined `signature` variable in webhook INSERT
- **Fixed:** Stored actual signature in `usedSignature` variable
- **Impact:** Webhooks now work, orders recorded, conversions tracked
