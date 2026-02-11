# Test Verification Guide

## Quick Test: Verify the Fix Works

### Test 1: Manual Parser Test
Test the parser directly with test.zologic.nl manifest:

```bash
cd /workspace/cmli1ekc80003imsdec6a0nxr/ucp-marketplace

# Create test file with actual manifest
cat > test-manifest.json << 'EOF'
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
        }
      ]
    }
  ],
  "capabilities": [
    {
      "name": "dev.ucp.shopping.products",
      "transports": ["rest"],
      "type": "read_only"
    },
    {
      "name": "dev.ucp.shopping.checkout",
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
EOF

# Test parser
node -e "
const { parseUcpManifest } = require('./api/utils/ucpParser');
const manifest = require('./test-manifest.json');
const result = parseUcpManifest(manifest);

if (result.isValid) {
  console.log('✅ PASS: Parser validates test.zologic.nl manifest');
  console.log('Extracted data:');
  console.log('  - business_name:', result.data.businessName);
  console.log('  - service_base_url:', result.data.serviceBaseUrl);
  console.log('  - public_key:', result.data.publicKey);
  console.log('  - signing_key_id:', result.data.signingKeyId);
  console.log('  - contact_email:', result.data.contactEmail);
  process.exit(0);
} else {
  console.error('❌ FAIL: Parser rejected manifest');
  console.error('Error:', result.error);
  process.exit(1);
}
"
```

**Expected Output:**
```
✅ PASS: Parser validates test.zologic.nl manifest
Extracted data:
  - business_name: test.zologic.nl
  - service_base_url: https://test.zologic.nl/wp-json/ucpready/v1
  - public_key: 8XrZI2whqI5l25CMDB9NbGwfAFbW-RTa1yugzouS2HE
  - signing_key_id: ucpready-1770438313
  - contact_email: contact@zologic.nl
```

---

### Test 2: Live UCP Endpoint Test
Verify the actual endpoint returns expected structure:

```bash
curl -s https://test.zologic.nl/.well-known/ucp | jq -r '
"Status: 200 OK
Fields present:
  business_profile: " + (if .business_profile then "✓" else "✗" end) + "
  services: " + (if .services then "✓" else "✗" end) + "
  capabilities: " + (if .capabilities then "✓" else "✗" end) + "
  signing_keys: " + (if .signing_keys then "✓" else "✗" end) + "

Validation:
  business_profile.name: " + .business_profile.name + "
  shopping service: " + (if (.services[] | select(.name == "shopping")) then "✓ Found" else "✗ Missing" end) + "
  products capability: " + (if (.capabilities[] | select(.name == "dev.ucp.shopping.products")) then "✓ Found" else "✗ Missing" end) + "
  checkout capability: " + (if (.capabilities[] | select(.name == "dev.ucp.shopping.checkout")) then "✓ Found" else "✗ Missing" end) + "
  signing key: " + (if (.signing_keys[] | select(.use == "sig")) then "✓ Found" else "✗ Missing" end) + "
"
'
```

**Expected Output:**
```
Status: 200 OK
Fields present:
  business_profile: ✓
  services: ✓
  capabilities: ✓
  signing_keys: ✓

Validation:
  business_profile.name: test.zologic.nl
  shopping service: ✓ Found
  products capability: ✓ Found
  checkout capability: ✓ Found
  signing key: ✓ Found
```

---

### Test 3: Database Migration Verification
After running migration, verify schema changes:

```bash
# Check if migration was applied
psql $DATABASE_URL -c "
SELECT migration_file, applied_at
FROM schema_migrations
WHERE migration_file = '001_add_ucp_business_profile.sql';
"

# Verify new columns exist
psql $DATABASE_URL -c "
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'merchants'
  AND column_name IN (
    'business_name',
    'business_description',
    'business_url',
    'contact_email',
    'service_base_url',
    'signing_key_id',
    'ucp_manifest'
  )
ORDER BY column_name;
"
```

**Expected Output:**
```
        column_name        |     data_type      | is_nullable
---------------------------+--------------------+-------------
 business_description      | text               | YES
 business_name             | character varying  | YES
 business_url              | character varying  | YES
 contact_email             | character varying  | YES
 service_base_url          | character varying  | YES
 signing_key_id            | character varying  | YES
 ucp_manifest              | jsonb              | YES
(7 rows)
```

---

### Test 4: End-to-End Admin UI Test (Manual)

After deployment:

1. **Open Admin UI**
   - Navigate to: `https://your-domain/admin`
   - Login with admin credentials

2. **Navigate to Merchants**
   - Click "Merchants" in sidebar
   - Click "Add New Merchant" button

3. **Test Verification**
   - Enter domain: `https://test.zologic.nl`
   - Click "Verify UCP" button
   - Wait for verification (2-5 seconds)

4. **Expected Result: SUCCESS**
   ```
   ✅ Domain verified successfully!

   Business Name: test.zologic.nl
   Status: Verified
   ```
   - "Add Merchant" button becomes enabled
   - No error messages displayed

5. **Verify Database Record**
   ```sql
   SELECT
       domain,
       business_name,
       service_base_url,
       signing_key_id,
       status,
       contact_email
   FROM merchants
   WHERE domain LIKE '%test.zologic.nl%';
   ```

   **Expected:**
   ```
   domain: https://test.zologic.nl
   business_name: test.zologic.nl
   service_base_url: https://test.zologic.nl/wp-json/ucpready/v1
   signing_key_id: ucpready-1770438313
   status: verified
   contact_email: contact@zologic.nl
   ```

---

### Test 5: Error Handling Tests

Test parser with invalid manifests:

#### Missing Business Profile
```javascript
node -e "
const { parseUcpManifest } = require('./api/utils/ucpParser');
const result = parseUcpManifest({ services: [], capabilities: [], signing_keys: [] });
console.log(result.isValid ? '❌ FAIL' : '✅ PASS');
console.log('Error:', result.error);
// Expected: 'Invalid UCP manifest: missing business profile name'
"
```

#### Missing Shopping Service
```javascript
node -e "
const { parseUcpManifest } = require('./api/utils/ucpParser');
const manifest = {
  business_profile: { name: 'Test' },
  services: [{ name: 'booking', transports: [] }],
  capabilities: [],
  signing_keys: []
};
const result = parseUcpManifest(manifest);
console.log(result.isValid ? '❌ FAIL' : '✅ PASS');
console.log('Error:', result.error);
// Expected: 'Invalid UCP manifest: missing shopping service'
"
```

#### Missing Required Capability
```javascript
node -e "
const { parseUcpManifest } = require('./api/utils/ucpParser');
const manifest = {
  business_profile: { name: 'Test' },
  services: [{ name: 'shopping', transports: [{ type: 'rest', base_url: 'https://test.com' }] }],
  capabilities: [{ name: 'dev.ucp.shopping.checkout', transports: ['rest'] }],
  signing_keys: [{ use: 'sig', x: 'key', kid: 'id' }]
};
const result = parseUcpManifest(manifest);
console.log(result.isValid ? '❌ FAIL' : '✅ PASS');
console.log('Error:', result.error);
// Expected: 'Invalid UCP manifest: missing required capability dev.ucp.shopping.products'
"
```

#### Missing Signing Key
```javascript
node -e "
const { parseUcpManifest } = require('./api/utils/ucpParser');
const manifest = {
  business_profile: { name: 'Test' },
  services: [{ name: 'shopping', transports: [{ type: 'rest', base_url: 'https://test.com' }] }],
  capabilities: [
    { name: 'dev.ucp.shopping.products', transports: ['rest'] },
    { name: 'dev.ucp.shopping.checkout', transports: ['rest'] }
  ],
  signing_keys: []
};
const result = parseUcpManifest(manifest);
console.log(result.isValid ? '❌ FAIL' : '✅ PASS');
console.log('Error:', result.error);
// Expected: 'Invalid UCP manifest: signing_keys array not found or empty'
"
```

**All error tests should output:** `✅ PASS` (meaning parser correctly rejects invalid manifests)

---

### Test 6: Worker Job Verification (After Deployment)

Test background verification job:

```bash
# Trigger a single merchant re-verification
psql $DATABASE_URL -c "
UPDATE merchants
SET last_verified_at = NOW() - INTERVAL '8 days'
WHERE domain = 'https://test.zologic.nl';
"

# Run worker job manually (or wait for scheduled run)
cd /workspace/cmli1ekc80003imsdec6a0nxr/ucp-marketplace
node -e "
const { Pool } = require('pg');
const { verifyMerchants } = require('./worker/jobs/verifyMerchants');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
verifyMerchants(pool)
  .then(result => {
    console.log('✅ Worker job completed:', result);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Worker job failed:', err);
    process.exit(1);
  });
"

# Check logs for success
# Expected: [verifyMerchants] ✓ test.zologic.nl
```

---

### Test 7: Product Indexing (After Deployment)

Verify product indexing uses new logic:

```bash
# Ensure merchant is verified and has service_base_url
psql $DATABASE_URL -c "
SELECT domain, service_base_url, status
FROM merchants
WHERE domain = 'https://test.zologic.nl';
"

# Run indexing job
node -e "
const { Pool } = require('pg');
const { indexProducts } = require('./worker/jobs/indexProducts');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
indexProducts(pool)
  .then(result => {
    console.log('✅ Indexing completed:', result);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Indexing failed:', err);
    process.exit(1);
  });
"

# Expected log: [indexProducts] ✓ test.zologic.nl: X products
```

---

## Complete Test Checklist

Run through all tests in order:

- [ ] Test 1: Parser validates test.zologic.nl manifest ✅
- [ ] Test 2: Live endpoint returns correct structure ✅
- [ ] Test 3: Database migration applied successfully ✅
- [ ] Test 4: Admin UI verification succeeds ✅
- [ ] Test 5: Error handling works for invalid manifests ✅
- [ ] Test 6: Worker verification job succeeds ✅
- [ ] Test 7: Product indexing uses new logic ✅

## Success Criteria

All tests must pass:
✅ Parser extracts correct fields
✅ Live endpoint accessible and valid
✅ Database schema updated
✅ Admin UI shows success
✅ Invalid manifests rejected with specific errors
✅ Background jobs work correctly
✅ Product indexing works

## If Any Test Fails

### Parser Test Fails
- Check api/utils/ucpParser.js syntax
- Verify manifest structure matches expected schema
- Review error message for specific issue

### Live Endpoint Test Fails
- Verify test.zologic.nl is accessible
- Check DNS resolution
- Confirm /.well-known/ucp path exists
- Validate JSON response

### Migration Test Fails
- Check DATABASE_URL is correct
- Verify database permissions
- Run migration manually with psql
- Check for existing column conflicts

### Admin UI Test Fails
- Check API logs: `pm2 logs api --lines 100`
- Verify network connectivity to test.zologic.nl
- Check browser console for JavaScript errors
- Confirm database connection works

### Worker Test Fails
- Check worker logs: `pm2 logs worker --lines 100`
- Verify database connection
- Check for syntax errors in modified files
- Review error messages for specific issues

---

**Test Date:** 2026-02-11
**Test Environment:** Production-like
**Expected Duration:** 10-15 minutes for all tests
**Pass Criteria:** All 7 test sections must pass
