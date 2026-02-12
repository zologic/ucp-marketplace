# Embedded Checkout Fix - UCP 2026 Support

## Problem
The buy button was redirecting to `https://test.zologic.nl/basket/` instead of loading an embedded checkout iframe. This happened because:

1. The UCP parser didn't extract the `embedded_checkout` capability from merchant manifests
2. The parser didn't support the new **UCP 2026 format** which uses a `services` array with `transport: "embedded"`

## What Was Fixed

### 1. UCP Parser Updates (`api/utils/ucpParser.js`)

**Added capability extraction:**
- Added `dev.ucp.shopping.embedded_checkout` to standard capabilities list
- Added `dev.ucp.shopping.checkout.embedded` for UCP 2026 format

**Added UCP 2026 services support:**
```javascript
function extractEmbeddedCheckoutFromServices(manifest) {
  // Extracts embedded checkout endpoint from:
  // manifest.ucp.services['dev.ucp.shopping'][]
  // where transport === 'embedded'
}
```

This function now correctly extracts:
- **Endpoint**: `https://test.zologic.nl/wp-json/ucpready/v1/embedded-checkout`
- **Transport**: `embedded`
- **Version**: `2026-01-23`

### 2. Verification Worker Updates (`worker/jobs/verifyMerchants.js`)

**Fixed import:**
```javascript
// OLD: const { parseUcpManifest } = require('/app/utils/ucpParser');
// NEW: const { parseManifest } = require('/app/utils/ucpParser');
```

**Updated data extraction:**
- Now properly extracts capabilities from parsed manifest
- Stores full manifest with discovered capabilities in database

### 3. Database Storage
The `ucp_manifest` JSONB field now correctly stores:
```json
{
  "...": "original manifest fields",
  "capabilities": [
    {
      "name": "dev.ucp.shopping.embedded_checkout",
      "supported": true,
      "endpoint": "https://test.zologic.nl/wp-json/ucpready/v1/embedded-checkout",
      "transport": "embedded"
    }
  ]
}
```

## How It Works Now

### Backend Flow (`api/routes/public.js`)

When a user clicks "Buy":

1. **Checkout endpoint receives request** (`POST /api/checkout`)
2. **Checks merchant's stored manifest**:
   ```javascript
   const embeddedCheckoutCap = merchant.ucp_manifest.capabilities.find(
     cap => cap.name === 'dev.ucp.shopping.embedded_checkout' && cap.supported === true
   );
   ```
3. **If capability exists with endpoint**:
   - Sets `supportsEmbeddedCheckout = true`
   - Uses embedded endpoint: `https://test.zologic.nl/wp-json/ucpready/v1/embedded-checkout?ref={referralId}`
   - Returns `{ embedded_checkout: true }` to frontend

4. **Frontend receives response** (`frontend/js/checkout.js`):
   ```javascript
   if (data.embedded_checkout) {
     showEmbeddedCheckout(data.checkout_url, data.referral_id);
   } else {
     showCheckoutRedirect(data.checkout_url);
   }
   ```

### Frontend Flow (`frontend/js/embedded-checkout.js`)

When `embedded_checkout: true`:

1. **Creates iframe overlay**
2. **Loads checkout URL in iframe**
3. **Sets up postMessage communication**
4. **Handles checkout completion/cancellation**

## What Needs to Happen Next

### For test.zologic.nl Merchant

**Merchant needs to be re-verified** so the updated parser can extract the embedded checkout capability:

```bash
# Option 1: Wait for daily verification job (runs at 02:00 UTC)

# Option 2: Trigger manual verification
docker compose exec api node -e "
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const { verifyMerchants } = require('./worker/jobs/verifyMerchants');
verifyMerchants(db).then(result => {
  console.log('Verification complete:', result);
  process.exit(0);
}).catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
"
```

### Frontend Enhancement (Optional - for full UCP 2026 compliance)

The current embedded checkout implementation uses simple postMessage. For full UCP 2026 Embedded Checkout Protocol compliance, consider enhancing to use **JSON-RPC 2.0 format**:

**Current format:**
```javascript
{ type: 'ec.ready' }
```

**UCP 2026 format:**
```javascript
{
  "jsonrpc": "2.0",
  "method": "embedded_checkout.ready",
  "params": {},
  "id": "unique-request-id"
}
```

**Note**: The current simple format works fine if the merchant's embedded checkout endpoint supports it. Only update if the merchant requires strict JSON-RPC 2.0 compliance.

## Testing

### Verify Embedded Checkout Capability

Run the diagnostic script:
```bash
./diagnose-merchant-checkout.sh test.zologic.nl
```

Expected output after re-verification:
```
2. Embedded checkout capability details:
[
  {
    "name": "dev.ucp.shopping.embedded_checkout",
    "supported": true,
    "endpoint": "https://test.zologic.nl/wp-json/ucpready/v1/embedded-checkout",
    "transport": "embedded"
  }
]
```

### Test Buy Button

1. Search for a product from test.zologic.nl
2. Click "Buy" button
3. **Expected**: Iframe overlay appears with embedded checkout
4. **Not expected**: Browser redirects to checkout URL

## Summary

**Fixed:**
- ✅ Parser now extracts embedded checkout capability
- ✅ Parser supports UCP 2026 services format
- ✅ Verification worker uses correct parser exports
- ✅ Capabilities properly stored in database

**Required action:**
- ⚠️ Re-verify merchant to extract embedded checkout endpoint

**Optional enhancement:**
- 📝 Update frontend to use JSON-RPC 2.0 format (only if merchant requires it)

---

**Result**: After merchant re-verification, buy buttons will load embedded checkout in an iframe instead of redirecting.
