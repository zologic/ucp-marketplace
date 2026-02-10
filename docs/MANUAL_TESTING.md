# Manual Testing Guide

## Test Environment Setup

Before testing, ensure all services are running:

```bash
docker-compose up -d
docker-compose ps
```

All services should show "Up" status.

## Test Scenarios

### 1. Tenant Resolution and Multi-Domain Support

**Objective:** Verify that different domains resolve to different tenants.

**Steps:**

1. Create test tenants in database:
```bash
docker-compose exec postgres psql -U postgres -d ucpready -c "
INSERT INTO tenants (domain, name, status) VALUES
('localhost', 'Local Tenant', 'active'),
('test.localhost', 'Test Tenant', 'active');
"
```

2. Test tenant resolution via API:
```bash
# Should resolve to 'Local Tenant'
curl -H "Host: localhost" http://localhost/api/health

# Should resolve to 'Test Tenant' (if supported by local DNS)
curl -H "Host: test.localhost" http://localhost/api/health
```

**Expected Result:** API responds successfully with different tenant contexts.

---

### 2. Merchant Onboarding Flow

**Objective:** Add merchant, verify UCP, activate, and ensure searchability.

**Steps:**

1. Create admin user (if not exists):
```bash
docker-compose exec postgres psql -U postgres -d ucpready -c "
INSERT INTO admins (email, password_hash, role)
VALUES ('test@admin.com', '\$2a\$10\$N9qo8uLOickgx2ZMRZoMye7YvJ7YfmZCsD7RI4K7YgZmNFNFQNFIm', 'admin');
"
# Password: 'password'
```

2. Login as admin:
```bash
TOKEN=$(curl -s -X POST http://localhost/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@admin.com","password":"password"}' \
  | jq -r '.token')

echo "Token: $TOKEN"
```

3. Get tenant ID:
```bash
TENANT_ID=$(docker-compose exec -T postgres psql -U postgres -d ucpready -t -c "SELECT id FROM tenants WHERE domain='localhost' LIMIT 1;" | tr -d ' \n')
echo "Tenant ID: $TENANT_ID"
```

4. Add merchant:
```bash
curl -X POST http://localhost/admin/merchants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"domain\":\"https://example-merchant.com\",\"tenant_id\":\"$TENANT_ID\",\"auto_verify\":false}"
```

**Expected Result:** Merchant created with status "pending".

5. List merchants:
```bash
curl http://localhost/admin/merchants \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected Result:** New merchant appears in list.

---

### 3. Product Search Flow

**Objective:** Search for products and verify results.

**Steps:**

1. Insert test products:
```bash
docker-compose exec postgres psql -U postgres -d ucpready << 'EOF'
-- Insert test merchant
INSERT INTO merchants (id, tenant_id, domain, status) VALUES
('00000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE domain='localhost'), 'https://test-merchant.com', 'active')
ON CONFLICT DO NOTHING;

-- Insert test products
INSERT INTO products (merchant_id, tenant_id, external_id, name, price_cents, currency, stock_status) VALUES
('00000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE domain='localhost'), 'prod1', 'Test Blue Shirt', 1990, 'EUR', 'in_stock'),
('00000000-0000-0000-0000-000000000001', (SELECT id FROM tenants WHERE domain='localhost'), 'prod2', 'Test Red Dress', 2990, 'EUR', 'in_stock')
ON CONFLICT DO NOTHING;
EOF
```

2. Search via API:
```bash
curl -X POST http://localhost/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"shirt"}' | jq
```

**Expected Result:** Returns "Test Blue Shirt" in results.

3. Open frontend in browser:
```
http://localhost
```

4. Search for "shirt"

**Expected Result:** UI shows search results with product cards.

---

### 4. Checkout Session Creation

**Objective:** Create checkout session and verify redirect URL.

**Steps:**

1. Get product and merchant IDs from previous search.

2. Create checkout session:
```bash
curl -X POST http://localhost/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"merchant_id":"00000000-0000-0000-0000-000000000001","product_id":"<product-id>"}' | jq
```

**Expected Result:** Returns checkout URL and referral ID.

3. In frontend UI, click "Buy" button on a product.

**Expected Result:** Loading message, then redirect to checkout URL (may show error if merchant not real).

---

### 5. Order Completion Webhook

**Objective:** Process order webhook and verify attribution.

**Steps:**

1. Simulate webhook (signature verification will fail without valid keys, but flow can be tested):
```bash
curl -X POST http://localhost/api/webhooks/order-completed \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "test_order_123",
    "merchant_domain": "https://test-merchant.com",
    "referral_id": "<referral-id-from-checkout>",
    "total_cents": 1990,
    "currency": "EUR",
    "signature": "dummy-signature"
  }'
```

**Expected Result:** Returns 400 (invalid signature) or 200 if signature validation bypassed in test mode.

2. Verify order recorded (if signature validation bypassed):
```bash
docker-compose exec postgres psql -U postgres -d ucpready -c "SELECT * FROM orders ORDER BY created_at DESC LIMIT 5;"
```

---

### 6. Merchant Analytics

**Objective:** View merchant analytics after events.

**Steps:**

1. Insert some daily stats:
```bash
docker-compose exec postgres psql -U postgres -d ucpready << 'EOF'
INSERT INTO merchant_daily_stats (tenant_id, merchant_id, date, search_count, click_count, checkout_count, order_count, revenue_cents)
VALUES (
  (SELECT id FROM tenants WHERE domain='localhost'),
  '00000000-0000-0000-0000-000000000001',
  CURRENT_DATE - INTERVAL '1 day',
  100, 50, 25, 10, 19900
);
EOF
```

2. Get analytics via API:
```bash
MERCHANT_ID="00000000-0000-0000-0000-000000000001"
curl "http://localhost/admin/merchants/$MERCHANT_ID/analytics?period=week" \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected Result:** Returns aggregated stats for the merchant.

---

### 7. MCP Hot Reload

**Objective:** Verify MCP server reloads merchant registry without restart.

**Steps:**

1. Check current merchant count in MCP:
```bash
docker-compose exec mcp-server wget -q -O - http://localhost:8080/internal/health | jq
```

2. Activate a merchant via admin:
```bash
curl -X POST http://localhost/admin/merchants/$MERCHANT_ID/activate \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Result:** MCP reload triggered automatically.

3. Check MCP health again:
```bash
docker-compose exec mcp-server wget -q -O - http://localhost:8080/internal/health | jq
```

**Expected Result:** `last_refresh` timestamp updated, merchant count reflects change.

---

### 8. Billing and Invoicing

**Objective:** Verify invoice generation and non-payment enforcement.

**Steps:**

1. Insert billable events:
```bash
docker-compose exec postgres psql -U postgres -d ucpready << 'EOF'
-- Insert merchant billing config
INSERT INTO merchant_billing (merchant_id, billing_mode, commission_percent, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'commission', 15, 'EUR')
ON CONFLICT DO NOTHING;

-- Insert billable events (last month)
INSERT INTO billable_events (tenant_id, merchant_id, event_type, reference_id, amount_cents, currency, occurred_at)
VALUES (
  (SELECT id FROM tenants WHERE domain='localhost'),
  '00000000-0000-0000-0000-000000000001',
  'order',
  'order1',
  300,
  'EUR',
  DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') + INTERVAL '15 days'
);
EOF
```

2. Manually trigger invoice generation:
```bash
docker-compose exec worker node -e "
const db = require('pg').Pool({connectionString: process.env.DATABASE_URL});
require('./jobs/generateInvoices').generateInvoices(new db()).then(console.log).catch(console.error).finally(() => process.exit());
"
```

**Expected Result:** Invoice created for the merchant.

3. Verify invoice:
```bash
docker-compose exec postgres psql -U postgres -d ucpready -c "SELECT * FROM invoices ORDER BY created_at DESC LIMIT 1;"
```

---

### 9. Worker Job Execution

**Objective:** Verify background jobs execute successfully.

**Steps:**

1. Check worker logs:
```bash
docker-compose logs worker | tail -50
```

**Expected Result:** Shows "Worker service started" and scheduled job list.

2. Manually trigger a job:
```bash
docker-compose exec worker node -e "
const db = require('pg').Pool({connectionString: process.env.DATABASE_URL});
require('./jobs/verifyMerchants').verifyMerchants(new db()).then(console.log).catch(console.error).finally(() => process.exit());
"
```

**Expected Result:** Job executes and logs results.

---

### 10. Error Handling

**Objective:** Verify graceful error handling.

**Test Cases:**

1. **Invalid search query:**
```bash
curl -X POST http://localhost/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":""}' | jq
```
**Expected:** 400 error with message.

2. **Non-existent merchant:**
```bash
curl -X POST http://localhost/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"merchant_id":"00000000-0000-0000-0000-000000000099","product_id":"invalid"}' | jq
```
**Expected:** 404 error.

3. **Unauthorized admin access:**
```bash
curl http://localhost/admin/merchants | jq
```
**Expected:** 401 error (no token).

---

## Clean Up Test Data

After testing, clean up:

```bash
docker-compose exec postgres psql -U postgres -d ucpready << 'EOF'
DELETE FROM products WHERE external_id LIKE 'prod%';
DELETE FROM merchants WHERE domain = 'https://test-merchant.com';
DELETE FROM admins WHERE email = 'test@admin.com';
DELETE FROM tenants WHERE domain IN ('test.localhost');
EOF
```

## Troubleshooting

If tests fail:

1. Check service logs:
```bash
docker-compose logs api
docker-compose logs worker
docker-compose logs postgres
```

2. Verify database connectivity:
```bash
docker-compose exec postgres pg_isready -U postgres
```

3. Restart services:
```bash
docker-compose restart
```

4. Check for port conflicts:
```bash
netstat -tulpn | grep :80
```
