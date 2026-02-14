# Webhook Registration System

## Overview

The UCP Marketplace webhook registration system ensures that merchant plugins know where to send order completion webhooks. This is a **critical** step in the order notification flow.

### Why Webhook Registration is Required

The merchant's UCPReady WordPress plugin **does not automatically know** where to send webhooks. The marketplace must explicitly register its webhook URL with each merchant during the verification process.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         WEBHOOK REGISTRATION FLOW                    │
└─────────────────────────────────────────────────────────────────────┘

1. Admin adds merchant to marketplace
   │
   ↓
2. Marketplace verifies UCP manifest
   │
   ↓
3. Marketplace checks for webhooks capability
   │
   ↓
4. Marketplace registers webhook URL via MCP RPC
   │
   │  POST https://merchant.com/wp-json/ucpready/v1/mcp-rpc
   │  {
   │    "jsonrpc": "2.0",
   │    "method": "ucp_register_webhook",
   │    "params": {
   │      "platform_id": "ucp_marketplace",
   │      "webhook_url": "https://marketplace.com/api/webhooks/order-completed"
   │    }
   │  }
   │
   ↓
5. Merchant plugin stores webhook URL
   │
   ↓
6. User completes order on merchant site
   │
   ↓
7. Merchant plugin sends POST to registered webhook URL
   │
   ↓
8. Marketplace receives webhook and creates order
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Marketplace webhook URL that merchants will call
MARKETPLACE_WEBHOOK_URL=https://your-marketplace.com/api/webhooks/order-completed

# Platform identifier for webhook registration
PLATFORM_ID=ucp_marketplace
```

### Database Migration

Run the migration to add webhook tracking columns:

```bash
psql $DATABASE_URL < database/migrations/008_add_webhook_registration_tracking.sql
```

This adds the following columns to the `merchants` table:
- `webhook_registered` - Boolean flag
- `webhook_id` - ID returned by merchant plugin
- `webhook_url` - Registered webhook URL
- `webhook_registered_at` - Registration timestamp
- `webhook_status` - Status: `not_registered`, `active`, `failed`, `unregistered`
- `webhook_error` - Last error message (if any)

## Automatic Registration

Webhook registration happens **automatically** during merchant verification:

```javascript
POST /api/admin/merchants/:id/verify
```

When a merchant is verified:
1. Marketplace fetches UCP manifest
2. Checks for `dev.ucp.shopping.webhooks` capability
3. If supported, automatically registers webhook URL
4. Stores registration status in database

### Verification Response

```json
{
  "status": "verified",
  "merchant": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "business_name": "Example Shop",
    "status": "verified"
  },
  "verification_results": {
    "manifest_valid": true,
    "capabilities_discovered": [
      {
        "name": "dev.ucp.shopping.webhooks",
        "supported": true
      }
    ]
  },
  "webhook_registration": {
    "success": true,
    "webhook_id": "wh_1234567890",
    "status": "registered",
    "registered_at": "2026-02-14T10:30:00Z",
    "events": ["order.completed"]
  }
}
```

## Manual Registration

For merchants already verified (before webhook registration was implemented), use manual registration:

### Register Webhook

```bash
POST /api/admin/merchants/:merchantId/register-webhook
Authorization: Bearer <admin_jwt_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "merchant_id": "550e8400-e29b-41d4-a716-446655440000",
  "domain": "merchant.example.com",
  "webhook": {
    "id": "wh_1234567890",
    "url": "https://marketplace.com/api/webhooks/order-completed",
    "status": "active",
    "registered_at": "2026-02-14T10:30:00Z",
    "events": ["order.completed"]
  },
  "message": "Webhook registered successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "merchant_id": "550e8400-e29b-41d4-a716-446655440000",
  "domain": "merchant.example.com",
  "error": "MCP RPC endpoint not found",
  "error_code": "ENDPOINT_NOT_FOUND",
  "message": "Webhook registration failed"
}
```

### Unregister Webhook

```bash
DELETE /api/admin/merchants/:merchantId/webhook
Authorization: Bearer <admin_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "merchant_id": "550e8400-e29b-41d4-a716-446655440000",
  "domain": "merchant.example.com",
  "message": "Webhook unregistered successfully",
  "unregistered_at": "2026-02-14T11:00:00Z"
}
```

### Test Webhook

```bash
POST /api/admin/merchants/:merchantId/test-webhook
Authorization: Bearer <admin_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "merchant_id": "550e8400-e29b-41d4-a716-446655440000",
  "domain": "merchant.example.com",
  "message": "Test webhook sent successfully",
  "tested_at": "2026-02-14T11:05:00Z"
}
```

## Error Handling

### Common Errors

| Error Code | Description | Solution |
|-----------|-------------|----------|
| `ENDPOINT_NOT_FOUND` | MCP RPC endpoint not found (404) | Ensure merchant has UCPReady plugin v2.0+ installed |
| `DNS_ERROR` | Could not resolve merchant domain | Check merchant domain configuration |
| `TIMEOUT` | Connection to merchant timed out | Check merchant server availability |
| `CONNECTION_REFUSED` | Merchant server refused connection | Check merchant firewall/network settings |
| `RPC_ERROR` | Merchant plugin returned error | Check merchant plugin logs |

### Webhook Status Values

- **`not_registered`** - Webhook has not been registered yet
- **`active`** - Webhook is registered and active
- **`failed`** - Last registration attempt failed (check `webhook_error`)
- **`unregistered`** - Webhook was previously registered but has been removed

## Monitoring

### Check Webhook Registration Status

```sql
SELECT
    id,
    domain,
    webhook_registered,
    webhook_status,
    webhook_registered_at,
    webhook_error
FROM merchants
WHERE webhook_registered = true
ORDER BY webhook_registered_at DESC;
```

### Find Merchants Without Webhooks

```sql
SELECT
    id,
    domain,
    status,
    webhook_status
FROM merchants
WHERE status IN ('verified', 'active')
  AND (webhook_registered = false OR webhook_registered IS NULL)
ORDER BY created_at DESC;
```

## Troubleshooting

### No Webhooks Arriving

**Problem:** Orders are placed on merchant site but marketplace doesn't receive webhooks.

**Diagnosis:**
1. Check if webhook is registered:
   ```sql
   SELECT webhook_registered, webhook_status, webhook_url, webhook_error
   FROM merchants WHERE domain = 'merchant.example.com';
   ```

2. If `webhook_registered = false`, register manually:
   ```bash
   POST /api/admin/merchants/:id/register-webhook
   ```

3. Test webhook delivery:
   ```bash
   POST /api/admin/merchants/:id/test-webhook
   ```

4. Check merchant plugin logs for webhook delivery attempts

### Registration Fails During Verification

**Problem:** Merchant verification succeeds but webhook registration fails.

**Solution:**
1. Verify merchant has UCPReady plugin v2.0+ (webhooks capability)
2. Check `webhook_error` column for details
3. Try manual registration with `/register-webhook` endpoint
4. Check merchant plugin MCP RPC endpoint accessibility

### Wrong Webhook URL Registered

**Problem:** Webhook was registered with incorrect URL.

**Solution:**
1. Unregister existing webhook:
   ```bash
   DELETE /api/admin/merchants/:id/webhook
   ```

2. Update `MARKETPLACE_WEBHOOK_URL` in `.env`

3. Re-register webhook:
   ```bash
   POST /api/admin/merchants/:id/register-webhook
   ```

## Implementation Details

### MCP RPC Protocol

The webhook registration uses JSON-RPC 2.0 over HTTP:

**Request Format:**
```json
{
  "jsonrpc": "2.0",
  "method": "ucp_register_webhook",
  "params": {
    "platform_id": "ucp_marketplace",
    "webhook_url": "https://marketplace.com/api/webhooks/order-completed",
    "events": ["order.completed"]
  },
  "id": "reg_1234567890"
}
```

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "webhook_id": "wh_1234567890",
    "status": "registered",
    "registered_at": "2026-02-14T10:30:00Z",
    "events": ["order.completed"]
  },
  "id": "reg_1234567890"
}
```

**Error Response:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": { "details": "platform_id required" }
  },
  "id": "reg_1234567890"
}
```

### Webhook Endpoint

Merchant plugins will POST to:
```
https://your-marketplace.com/api/webhooks/order-completed
```

With signature verification using Ed25519 (see `api/routes/webhooks.js`).

## Migration Path for Existing Merchants

If you have merchants added **before** webhook registration was implemented:

1. Run database migration to add tracking columns
2. Identify merchants needing registration:
   ```sql
   SELECT id, domain FROM merchants
   WHERE status IN ('verified', 'active')
   AND (webhook_registered = false OR webhook_registered IS NULL);
   ```

3. Register webhooks for each merchant:
   ```bash
   for merchant_id in $(get_merchant_ids); do
     curl -X POST \
       https://your-marketplace.com/api/admin/merchants/$merchant_id/register-webhook \
       -H "Authorization: Bearer $ADMIN_TOKEN"
   done
   ```

4. Verify registrations:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE webhook_registered = true) as registered,
     COUNT(*) FILTER (WHERE webhook_status = 'failed') as failed,
     COUNT(*) FILTER (WHERE webhook_registered = false) as not_registered
   FROM merchants WHERE status IN ('verified', 'active');
   ```

## Security Considerations

1. **Webhook URL** must use HTTPS in production
2. **Platform ID** should be unique and descriptive (e.g., `your_marketplace_name`)
3. **Signature Verification** is enforced on incoming webhooks (see webhooks.js)
4. **Webhook IDs** are stored for audit trail and unregistration

## Next Steps

After webhook registration is working:
1. Monitor webhook delivery success rate
2. Implement webhook retry logic (if merchant temporarily down)
3. Add webhook delivery logs/analytics
4. Set up alerts for registration failures
5. Document webhook format for merchant plugin developers

## Support

For merchant plugin integration questions:
- See `docs/WEBHOOK_FIX.md` for webhook troubleshooting
- See `docs/EMBEDDED_CHECKOUT_MERCHANT_IMPLEMENTATION.md` for merchant setup
- Contact: admin@your-marketplace.com
