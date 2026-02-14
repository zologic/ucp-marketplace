# Webhook Registration Quick Start

## 🚨 CRITICAL: Why This Matters

**You found the missing piece!** The marketplace needs to **register its webhook URL** with each merchant's plugin. Without this, merchants can't send order notifications and you'll never receive webhooks.

## The Problem

```
❌ Before: Merchant plugin doesn't know where to send webhooks
   User completes order → Plugin has no webhook URL → No notification → No order recorded

✅ After: Marketplace registers webhook during verification
   User completes order → Plugin sends to registered URL → Webhook received → Order created
```

## Quick Setup (5 Minutes)

### Step 1: Run Database Migration

```bash
cd /workspace/cmllulxn7000jispj3b3le8dc/ucp-marketplace
psql $DATABASE_URL < database/migrations/008_add_webhook_registration_tracking.sql
```

### Step 2: Update Environment Variables

Add to your `.env` file:

```bash
# Your marketplace's public webhook endpoint
MARKETPLACE_WEBHOOK_URL=https://your-marketplace.com/api/webhooks/order-completed

# Platform identifier (keep default or customize)
PLATFORM_ID=ucp_marketplace
```

### Step 3: Restart API Server

```bash
# If using Docker:
docker-compose restart api

# If running locally:
cd api && npm start
```

## For New Merchants

**Automatic!** When you verify a merchant, the webhook is automatically registered:

```bash
POST /api/admin/merchants/:id/verify
```

The response will include:

```json
{
  "webhook_registration": {
    "success": true,
    "webhook_id": "wh_1234567890",
    "status": "registered"
  }
}
```

## For Existing Merchants (Migration)

If you have merchants added **before** this fix, register their webhooks manually:

### 1. Find Merchants Needing Registration

```sql
SELECT id, domain, status, webhook_registered
FROM merchants
WHERE status IN ('verified', 'active')
  AND (webhook_registered = false OR webhook_registered IS NULL);
```

### 2. Register Each Merchant's Webhook

```bash
# Get your admin token
ADMIN_TOKEN="your_jwt_token_here"

# Register webhook for merchant
curl -X POST \
  https://your-marketplace.com/api/admin/merchants/<MERCHANT_ID>/register-webhook \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**Success Response:**
```json
{
  "success": true,
  "webhook": {
    "id": "wh_abc123",
    "status": "active",
    "url": "https://your-marketplace.com/api/webhooks/order-completed"
  }
}
```

### 3. Verify Registration

```sql
SELECT
  domain,
  webhook_registered,
  webhook_status,
  webhook_registered_at,
  webhook_error
FROM merchants
WHERE id = '<MERCHANT_ID>';
```

## Testing Webhook Delivery

Test that webhooks can be delivered to a merchant:

```bash
curl -X POST \
  https://your-marketplace.com/api/admin/merchants/<MERCHANT_ID>/test-webhook \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Test webhook sent successfully",
  "tested_at": "2026-02-14T10:30:00Z"
}
```

## Troubleshooting

### Merchant Plugin Returns 404

**Problem:** `ENDPOINT_NOT_FOUND` error

**Cause:** Merchant doesn't have UCPReady plugin v2.0+ (webhooks capability)

**Solution:**
1. Ask merchant to update plugin to latest version
2. Re-verify merchant after plugin update

### Webhook Registration Fails

**Problem:** Registration succeeds but webhook_status = 'failed'

**Diagnosis:**
```sql
SELECT domain, webhook_error FROM merchants WHERE id = '<MERCHANT_ID>';
```

**Common Errors:**
- `DNS_ERROR`: Merchant domain unreachable
- `TIMEOUT`: Merchant server slow/down
- `CONNECTION_REFUSED`: Firewall blocking request

### No Webhooks Arriving After Registration

**Checklist:**
1. ✅ Webhook registered? `SELECT webhook_registered FROM merchants WHERE id = ?`
2. ✅ Webhook status active? `SELECT webhook_status FROM merchants WHERE id = ?`
3. ✅ Merchant plugin updated? (v2.0+)
4. ✅ Order placed with referral ID? Check merchant order meta
5. ✅ Webhook signature valid? Check API logs for signature errors

## Batch Registration Script

For multiple merchants, use this script:

```bash
#!/bin/bash

# Configuration
API_URL="https://your-marketplace.com"
ADMIN_TOKEN="your_admin_jwt_token"

# Get all unregistered merchants
MERCHANT_IDS=$(psql $DATABASE_URL -t -c "
  SELECT id FROM merchants
  WHERE status IN ('verified', 'active')
    AND (webhook_registered = false OR webhook_registered IS NULL);
")

# Register each merchant
for MERCHANT_ID in $MERCHANT_IDS; do
  echo "Registering webhook for merchant: $MERCHANT_ID"

  RESPONSE=$(curl -s -X POST \
    "$API_URL/api/admin/merchants/$MERCHANT_ID/register-webhook" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json")

  if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ Success: $MERCHANT_ID"
  else
    echo "❌ Failed: $MERCHANT_ID"
    echo "   Error: $(echo $RESPONSE | jq -r '.error')"
  fi

  sleep 1  # Be nice to servers
done

# Show summary
psql $DATABASE_URL -c "
  SELECT
    webhook_status,
    COUNT(*) as count
  FROM merchants
  WHERE status IN ('verified', 'active')
  GROUP BY webhook_status;
"
```

## Admin Dashboard Integration

Add webhook status to your merchant list view:

```javascript
// Show webhook registration status
{merchant.webhook_registered ? (
  <Badge color="green">Webhook Active</Badge>
) : (
  <Badge color="red">Webhook Not Registered</Badge>
)}

// Add manual registration button
{!merchant.webhook_registered && (
  <Button onClick={() => registerWebhook(merchant.id)}>
    Register Webhook
  </Button>
)}
```

## Verification Checklist

After deployment, verify:

- [ ] Database migration applied successfully
- [ ] Environment variables set (`MARKETPLACE_WEBHOOK_URL`, `PLATFORM_ID`)
- [ ] API server restarted with new config
- [ ] New merchant verification includes webhook registration
- [ ] Existing merchants have webhooks registered
- [ ] Test webhook delivery succeeds
- [ ] Order completion webhook received and recorded

## Next Steps

1. **Monitor webhook success rate:**
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE webhook_status = 'active') * 100.0 / COUNT(*) as success_rate
   FROM merchants WHERE status IN ('verified', 'active');
   ```

2. **Set up alerts** for webhook registration failures

3. **Document merchant plugin setup** (see `docs/EMBEDDED_CHECKOUT_MERCHANT_IMPLEMENTATION.md`)

4. **Test end-to-end flow** with a real merchant order

## Support

- Full documentation: `docs/WEBHOOK_REGISTRATION.md`
- Webhook troubleshooting: `docs/WEBHOOK_FIX.md`
- Questions: admin@your-marketplace.com

---

**Remember:** Without webhook registration, **no orders will be recorded**. This is the critical link between merchant sites and your marketplace. 🔗
