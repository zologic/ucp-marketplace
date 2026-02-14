# Webhook Registration with Merchant Plugin

## Problem Solved

**Root cause of zero conversions:** The marketplace wasn't registering its webhook URL with merchant plugins, so merchants didn't know where to send order webhooks.

## Solution

Added automatic webhook registration during merchant verification + manual registration endpoint for existing merchants.

## How It Works

### Automatic Registration (During Verification)

When you verify a merchant in the admin dashboard:

1. **Marketplace fetches UCP manifest** - Gets capabilities, public key, service URLs
2. **Marketplace updates merchant record** - Stores public_key, service_base_url, etc.
3. **NEW: Marketplace registers webhook URL** - Calls merchant's MCP endpoint
4. **Merchant plugin stores webhook URL** - Now knows where to send order notifications

### Registration Process

```javascript
// Marketplace calls merchant's MCP endpoint:
POST https://test.zologic.nl/wp-json/ucpready/v1/mcp-rpc

Body:
{
  "jsonrpc": "2.0",
  "method": "ucp_register_webhook",
  "params": {
    "platform_id": "bizform_app",
    "webhook_url": "https://bizform.app/api/webhooks/order-completed"
  },
  "id": "reg_1234567890"
}

// Merchant plugin responds:
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "platform_id": "bizform_app",
    "webhook_url": "https://bizform.app/api/webhooks/order-completed"
  },
  "id": "reg_1234567890"
}
```

## Usage

### Method 1: Automatic (Recommended)

**For new merchants:**
1. Go to Admin Dashboard → Merchants
2. Click "Verify" button for merchant
3. Webhook registration happens automatically
4. Check logs: `[Merchant Verify] ✓ Registered webhook URL with merchant.com`

**For existing verified merchants:**
1. Click "Verify" button again (re-verification)
2. Manifest unchanged → still registers webhook
3. Or use Method 2 (manual registration)

### Method 2: Manual Registration

**Via Admin Dashboard:**
(If UI is added, there will be a "Register Webhook" button)

**Via API:**
```bash
curl -X POST https://bizform.app/admin/merchants/{merchant_id}/register-webhook \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**Response on success:**
```json
{
  "status": "success",
  "merchant": {
    "id": 123,
    "domain": "test.zologic.nl",
    "business_name": "Test Store"
  },
  "webhook_url": "https://bizform.app/api/webhooks/order-completed",
  "mcp_response": {
    "jsonrpc": "2.0",
    "result": {
      "success": true,
      "platform_id": "bizform_app"
    }
  },
  "registered_at": "2026-02-14T10:30:00.000Z"
}
```

**Response on failure:**
```json
{
  "error": "Webhook registration failed",
  "details": "Webhook registration failed: connect ECONNREFUSED (CONNECTION_REFUSED)"
}
```

## Webhook URL Configuration

The marketplace webhook URL is determined by:

1. **Environment variable (production):**
   ```bash
   PUBLIC_URL=https://bizform.app
   # Webhook URL: https://bizform.app/api/webhooks/order-completed
   ```

2. **Default (if PUBLIC_URL not set):**
   ```bash
   # Webhook URL: https://bizform.app/api/webhooks/order-completed
   ```

3. **Custom domain tenants:**
   Each tenant should set their own PUBLIC_URL in environment.

## Complete Order Flow (After Registration)

```
User clicks "Buy Now" on marketplace
  ↓
Checkout session created (referral_id: ABC-123)
  ↓
User redirected to merchant with return URL
  ↓
User completes purchase on merchant site
  ↓
Merchant WooCommerce order created (status: completed)
  ↓
UCPReady plugin triggers webhook
  ↓
Plugin checks registered platforms (finds bizform_app)
  ↓
Plugin sends webhook to: https://bizform.app/api/webhooks/order-completed
  Headers:
    - Content-Type: application/json
    - Request-Signature: <JWT detached signature>
  Body:
    - order_id: "12345"
    - merchant_domain: "test.zologic.nl"
    - referral_id: "ABC-123"
    - total_cents: 7900
    - currency: "EUR"
  ↓
Marketplace webhook handler:
  - Verifies JWT signature
  - Creates order record
  - Updates checkout session status
  - Calculates commission
  - Creates billable event
  ↓
Analytics shows conversion ✓
```

## Verification for Existing Merchants

If you have merchants already verified BEFORE this change was deployed:

### Option A: Re-verify All Merchants (Batch)

```sql
-- Get all verified merchants
SELECT id, domain FROM merchants WHERE status = 'verified';
```

For each merchant:
```bash
curl -X POST https://bizform.app/admin/merchants/{merchant_id}/register-webhook \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Option B: Automated Script

Create a script to register all verified merchants:

```javascript
// scripts/register-webhooks-bulk.js
const axios = require('axios');
const { Pool } = require('pg');

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function registerAll() {
    const result = await db.query(`
        SELECT id, domain FROM merchants WHERE status = 'verified'
    `);

    for (const merchant of result.rows) {
        try {
            await axios.post(
                `http://localhost:3000/admin/merchants/${merchant.id}/register-webhook`,
                {},
                { headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` } }
            );
            console.log(`✓ Registered: ${merchant.domain}`);
        } catch (error) {
            console.error(`✗ Failed: ${merchant.domain} - ${error.message}`);
        }
    }

    await db.end();
}

registerAll();
```

Run:
```bash
node scripts/register-webhooks-bulk.js
```

## Troubleshooting

### Registration Fails: "Merchant has no service_base_url"

**Cause:** Merchant not verified or verification incomplete

**Fix:**
1. Verify merchant first: Admin → Merchants → Verify
2. Then try webhook registration again

### Registration Fails: "CONNECTION_REFUSED"

**Cause:** Merchant's server unreachable or MCP endpoint not available

**Fix:**
1. Check merchant's server is online: `curl https://merchant.com`
2. Check MCP endpoint exists: `curl https://merchant.com/wp-json/ucpready/v1/mcp-rpc`
3. Verify merchant plugin is installed and active

### Registration Fails: "ENDPOINT_NOT_FOUND" (404)

**Cause:** Merchant plugin doesn't have MCP endpoint implemented

**Fix:**
1. Update merchant's UCPReady plugin to latest version
2. Ensure plugin includes MCP RPC endpoint at `/wp-json/ucpready/v1/mcp-rpc`

### Registration Succeeds But No Webhooks Arrive

**Possible causes:**
1. Merchant plugin not triggering on order completion
2. Webhook URL stored but not used
3. Signature verification failing

**Debug:**
1. Check merchant plugin logs for webhook sending attempts
2. Check marketplace API logs for incoming webhook requests
3. Test webhook manually: `node test-webhook.js`
4. Verify public key matches between merchant and marketplace

### How to Check If Registration Worked

**On merchant site (WordPress):**
```bash
wp eval '
$registry = new \UCPReady\CapabilityRegistry();
$platforms = $registry->get_registered_platforms();
print_r($platforms);
'
```

Should show:
```
Array
(
    [bizform_app] => Array
        (
            [webhook_url] => https://bizform.app/api/webhooks/order-completed
        )
)
```

**On marketplace (database):**
```sql
-- Check merchant is verified and has service_base_url
SELECT
    domain,
    status,
    service_base_url,
    public_key IS NOT NULL as has_public_key
FROM merchants
WHERE domain = 'test.zologic.nl';
```

## API Logs

**Successful registration:**
```
[Merchant Verify] ✓ Registered webhook URL with test.zologic.nl
```

**Failed registration (non-fatal):**
```
[Merchant Verify] Failed to register webhook with test.zologic.nl: connect ECONNREFUSED
```

Note: Verification still succeeds even if webhook registration fails (non-blocking).

## Environment Variables

```bash
# .env
PUBLIC_URL=https://bizform.app  # Your marketplace public URL
```

**Important:** Set PUBLIC_URL correctly in production so merchants receive the correct webhook URL.

## Migration Notes

**Before this change:**
- Merchants verified ✓
- Public keys stored ✓
- Webhook endpoint ready ✓
- ❌ Merchants didn't know where to send webhooks

**After this change:**
- Verification automatically registers webhook URL ✓
- Manual registration endpoint available ✓
- Merchants now know where to send webhooks ✓
- Conversions will start tracking ✓

**Action required:**
- Re-verify existing merchants OR use manual registration endpoint
- Set PUBLIC_URL environment variable in production
- Test complete order flow end-to-end

## Testing

### Test Webhook Registration

```bash
# 1. Verify merchant (registers webhook automatically)
curl -X POST https://bizform.app/admin/merchants/123/verify \
  -H "Authorization: Bearer TOKEN"

# 2. Check logs for registration success
docker compose logs api | grep "Registered webhook URL"

# 3. Verify on merchant site
# SSH to merchant server:
wp eval '$registry = new \UCPReady\CapabilityRegistry(); print_r($registry->get_registered_platforms());'

# 4. Complete test order on merchant site
# Place order, complete payment, mark as completed

# 5. Check marketplace API logs for webhook
docker compose logs api | grep "POST /api/webhooks/order-completed"

# 6. Verify order created
docker compose exec -T postgres psql -U postgres -d ucpready -c "
SELECT id, referral_id, merchant_order_id, revenue_cents
FROM orders
ORDER BY created_at DESC
LIMIT 5;
"

# 7. Check analytics
# Should now show conversions > 0
```

## Related Files

- `api/routes/admin.js` - Webhook registration implementation
- `api/routes/webhooks.js` - Webhook handler
- `WEBHOOK_TROUBLESHOOTING.md` - General webhook debugging
- `TEST_WEBHOOK_GUIDE.md` - Manual webhook testing

## Next Steps

1. **Deploy this change** to production
2. **Re-verify all existing merchants** to register webhooks
3. **Test complete order flow** with at least one merchant
4. **Monitor API logs** for webhook arrivals
5. **Check analytics** - conversions should start tracking
