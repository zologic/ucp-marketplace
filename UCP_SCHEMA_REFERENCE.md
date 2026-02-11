# UCP Schema Reference

## Schema Comparison: Old vs New

### Old UCP Schema (Not Supported)
```json
{
  "products_endpoint": "https://example.com/api/products",
  "checkout_endpoint": "https://example.com/api/checkout",
  "public_key": "some-base64-key"
}
```

### New UCP Schema (Supported)
```json
{
  "business_profile": {
    "name": "Example Store",
    "url": "https://example.com",
    "description": "An example store",
    "contact": {
      "email": "contact@example.com"
    }
  },
  "services": [
    {
      "name": "shopping",
      "transports": [
        {
          "type": "rest",
          "required": true,
          "base_url": "https://example.com/api/v1"
        }
      ]
    }
  ],
  "capabilities": [
    {
      "name": "dev.ucp.shopping.products",
      "spec_origin": "https://ucp.dev/latest/specification/capabilities/shopping/products",
      "transports": ["rest"],
      "type": "read_only"
    },
    {
      "name": "dev.ucp.shopping.checkout",
      "spec_origin": "https://ucp.dev/latest/specification/capabilities/shopping/checkout",
      "transports": ["rest"]
    }
  ],
  "signing_keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "base64-encoded-public-key",
      "use": "sig",
      "kid": "key-identifier-123"
    }
  ]
}
```

## Field Mapping

| Old Field | New Location | Extraction Logic |
|-----------|-------------|------------------|
| `products_endpoint` | Derived from `services[].transports[].base_url` + `/products` | Find shopping service → rest transport → append `/products` |
| `checkout_endpoint` | Derived from `services[].transports[].base_url` + `/checkout` | Find shopping service → rest transport → append `/checkout` |
| `public_key` | `signing_keys[].x` (where `use === "sig"`) | Find first signing key with `use="sig"` → extract `x` field |

## Database Schema Changes

### New Columns Added to `merchants` Table

| Column Name | Type | Purpose |
|------------|------|---------|
| `business_name` | VARCHAR(255) | Business name from business_profile.name |
| `business_description` | TEXT | Business description from business_profile.description |
| `business_url` | VARCHAR(500) | Business website from business_profile.url |
| `contact_email` | VARCHAR(255) | Contact email from business_profile.contact.email |
| `service_base_url` | VARCHAR(500) | REST API base URL from services.transports.base_url |
| `signing_key_id` | VARCHAR(255) | Key identifier (kid) from signing_keys |
| `ucp_manifest` | JSONB | Full UCP manifest for future flexibility |

### Existing Columns (Still Used)

| Column Name | Old Usage | New Usage |
|------------|-----------|-----------|
| `ucp_endpoint` | Stored manifest URL | Same (still stores `/.well-known/ucp` URL) |
| `public_key` | Stored old schema key | Now stores `x` value from signing_keys |
| `status` | Merchant verification status | Same (`pending`, `verified`, `active`) |

## Validation Rules

### Required Fields
The parser validates these fields exist in the manifest:

1. **Business Profile**
   - ✅ `business_profile.name` must exist and be non-empty

2. **Shopping Service**
   - ✅ `services[]` must contain object with `name === "shopping"`
   - ✅ Shopping service must have `transports[]` array
   - ✅ At least one transport must have `type === "rest"`
   - ✅ REST transport must have non-empty `base_url`

3. **Capabilities**
   - ✅ `capabilities[]` must contain `dev.ucp.shopping.products`
   - ✅ `capabilities[]` must contain `dev.ucp.shopping.checkout`
   - ✅ Both capabilities must include `"rest"` in their `transports[]` array

4. **Signing Keys**
   - ✅ `signing_keys[]` must contain at least one key
   - ✅ At least one key must have `use === "sig"`
   - ✅ Signing key must have `x` field (public key component)
   - ✅ Signing key must have `kid` field (key identifier)

### Optional Fields
These fields are extracted but not required for validation:

- ❓ `business_profile.description` (defaults to empty string)
- ❓ `business_profile.url` (defaults to empty string)
- ❓ `business_profile.contact.email` (defaults to empty string)

## Example: test.zologic.nl

### Actual Manifest
```json
{
  "business_profile": {
    "name": "test.zologic.nl",
    "url": "https://test.zologic.nl",
    "description": "",
    "contact": {
      "email": "contact@zologic.nl"
    }
  },
  "services": [
    {
      "name": "shopping",
      "transports": [
        {
          "type": "rest",
          "required": true,
          "base_url": "https://test.zologic.nl/wp-json/ucpready/v1"
        },
        {
          "type": "mcp",
          "required": false
        }
      ]
    }
  ],
  "capabilities": [
    {
      "name": "dev.ucp.shopping.products",
      "spec_origin": "https://ucp.dev/latest/specification/capabilities/shopping/products",
      "transports": ["rest"],
      "type": "read_only"
    },
    {
      "name": "dev.ucp.shopping.checkout",
      "spec_origin": "https://ucp.dev/latest/specification/capabilities/shopping/checkout",
      "transports": ["rest"]
    },
    {
      "name": "dev.ucp.shopping.order",
      "spec_origin": "https://ucp.dev/latest/specification/capabilities/shopping/order",
      "transports": ["rest"]
    }
  ],
  "signing_keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "8XrZI2whqI5l25CMDB9NbGwfAFbW-RTa1yugzouS2HE",
      "use": "sig",
      "kid": "ucpready-1770438313"
    }
  ]
}
```

### Extracted Data
- **business_name**: "test.zologic.nl"
- **business_url**: "https://test.zologic.nl"
- **business_description**: "" (empty)
- **contact_email**: "contact@zologic.nl"
- **service_base_url**: "https://test.zologic.nl/wp-json/ucpready/v1"
- **public_key**: "8XrZI2whqI5l25CMDB9NbGwfAFbW-RTa1yugzouS2HE"
- **signing_key_id**: "ucpready-1770438313"

### Derived Endpoints
- **Products Endpoint**: `https://test.zologic.nl/wp-json/ucpready/v1/products`
- **Checkout Endpoint**: `https://test.zologic.nl/wp-json/ucpready/v1/checkout`

## Error Messages

### Validation Failures

| Error Message | Cause | Solution |
|--------------|-------|----------|
| "Invalid UCP manifest: missing business profile name" | `business_profile.name` missing or empty | Add business name to manifest |
| "Invalid UCP manifest: missing shopping service" | No service with `name === "shopping"` | Add shopping service to services array |
| "Invalid UCP manifest: REST transport base_url not found" | No REST transport or missing base_url | Add REST transport with base_url to shopping service |
| "Invalid UCP manifest: missing required capability dev.ucp.shopping.products" | Products capability missing | Add products capability to capabilities array |
| "Invalid UCP manifest: capability dev.ucp.shopping.checkout does not support REST transport" | Checkout capability exists but REST not in transports | Add "rest" to capability transports array |
| "Invalid UCP manifest: no valid signing key found" | No key with `use="sig"` or missing x/kid | Add valid signing key with use, x, and kid fields |
| "UCP endpoint not reachable" | Network error or endpoint doesn't exist | Verify domain and /.well-known/ucp path |

## Testing Your UCP Manifest

### Quick Test via cURL
```bash
curl -s https://your-domain/.well-known/ucp | jq .
```

### Validation Checklist
- [ ] Returns HTTP 200 status
- [ ] Returns valid JSON (not HTML)
- [ ] Contains `business_profile` with `name`
- [ ] Contains `services` array with shopping service
- [ ] Shopping service has REST transport with `base_url`
- [ ] Contains `capabilities` array with products and checkout
- [ ] Both capabilities include "rest" in transports
- [ ] Contains `signing_keys` array with sig key
- [ ] Signing key has `use`, `x`, and `kid` fields

### Manual Parser Test
```javascript
// Test parser locally
const { parseUcpManifest } = require('./api/utils/ucpParser');
const manifest = require('./test-manifest.json');
const result = parseUcpManifest(manifest);

if (result.isValid) {
  console.log('✅ Valid manifest');
  console.log('Data:', result.data);
} else {
  console.error('❌ Invalid manifest');
  console.error('Error:', result.error);
}
```

## Edge Cases Handled

### Multiple Signing Keys
If manifest contains multiple signing keys, the parser uses the first one where `use === "sig"`.

### Base URL with Trailing Slash
Parser automatically removes trailing slashes from `base_url` to ensure consistent endpoint construction:
- Input: `"https://example.com/api/"` → Stored: `"https://example.com/api"`
- Endpoint: `"https://example.com/api/products"` (correct)

### Missing Optional Fields
Parser gracefully handles missing optional fields with empty string defaults:
- Missing `description` → `""`
- Missing `contact.email` → `""`
- Missing `url` → `""`

### Additional Capabilities
Manifest can include extra capabilities beyond products and checkout. Parser only validates required ones.

### Additional Transports
Shopping service can include multiple transports (REST, MCP, A2A, embedded). Parser only requires REST transport.

## Integration Points

### Admin API (`/api/routes/admin.js`)
- **Endpoint**: `POST /admin/merchants`
- **Trigger**: User clicks "Verify UCP" in Admin UI
- **Behavior**: Fetches manifest, parses with `parseUcpManifest()`, updates database
- **Response**: Returns status, error message, or success with extracted fields

### Worker Background Job (`/worker/jobs/verifyMerchants.js`)
- **Schedule**: Daily at 02:00 UTC
- **Purpose**: Re-verify merchants that haven't been checked in 7+ days
- **Behavior**: Same parsing logic as admin route
- **Logging**: Logs specific errors to console for debugging

### Product Indexing (`/worker/jobs/indexProducts.js`)
- **Schedule**: Every 6 hours
- **Purpose**: Fetch and index products from verified merchants
- **Behavior**: Uses stored `service_base_url` + `/products` (no manifest fetch)
- **Performance**: Faster (no extra HTTP call to manifest endpoint)

### Internal API (`/api/routes/internal.js`)
- **Endpoint**: `GET /internal/active-merchants`
- **Purpose**: Provide merchant data to MCP server
- **Fields Exposed**: Includes new fields (signing_key_id, service_base_url, business_name)
- **Consumer**: MCP server for UCP signature verification

## Migration Notes

### For Existing Merchants
Merchants already in database with old schema data:
1. Background verification job will re-fetch their manifests
2. If merchant upgraded to new UCP schema → verification succeeds, all fields populated
3. If merchant still uses old schema → verification fails with specific error
4. Admin can contact merchant to upgrade their UCP implementation

### For New Merchants
All new merchants must use the new UCP schema. Old schema will be rejected immediately with clear error message.

## References

- **UCP Specification**: https://ucp.dev/latest/specification
- **Shopping Capabilities**: https://ucp.dev/latest/specification/capabilities/shopping
- **Ed25519 Keys**: https://datatracker.ietf.org/doc/html/rfc8032

---

**Last Updated:** 2026-02-11
**Schema Version:** New UCP Schema (2024+)
