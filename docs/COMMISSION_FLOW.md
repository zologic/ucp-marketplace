# Commission Calculation & Order Flow

## Complete Flow Diagram

```
User Purchase → Merchant Checkout → Order Complete
                                         ↓
                              Webhook to Marketplace
                                         ↓
                            Commission Calculated & Recorded
                                         ↓
                              Monthly Invoice Generated
```

## Step-by-Step Flow

### 1. Checkout Initiation
- **User** clicks "Buy Now" on marketplace
- **Marketplace** creates checkout session with `referral_id` (UUID)
- Records in `checkout_sessions` table with `referral_source` (e.g., "UCP-bizform.app")
- Redirects user to merchant checkout with `return_url` and `cancel_url`

### 2. User Completes Purchase on Merchant Site
- User fills out shipping/billing, selects payment
- Merchant processes payment through their gateway (Stripe, Mollie, etc.)
- Order created in WooCommerce

### 3. Merchant Plugin Sends Webhook

**Endpoint:** `POST /api/webhooks/order-completed`

**Webhook Payload:**
```json
{
  "order_id": "12345",
  "merchant_domain": "test.zologic.nl",
  "referral_id": "cd656f5c-0be4-44ba-abc2-05d7e7c91585",
  "total_cents": 7900,
  "currency": "EUR",
  "signature": "base64_ed25519_signature"
}
```

**Security:** Ed25519 signature verification using merchant's public key

### 4. Marketplace Receives Webhook

**Location:** `api/routes/webhooks.js` (lines 24-233)

**Process:**
1. **Verify signature** using merchant's public key (lines 53-62)
2. **Check for duplicate** - prevent double-recording (lines 65-73)
3. **Update checkout session** status to 'completed' (lines 88-91)
4. **Create order record** in `orders` table (lines 98-102)
5. **Calculate commission** (lines 191-222)
6. **Record billable event** (lines 194-198)
7. **Create revenue split** if tenant has revenue share (lines 203-221)

### 5. Commission Calculation

**Location:** Lines 191-222 of `webhooks.js`

**Formula:**
```javascript
commissionAmount = Math.round((total_cents * commission_percent) / 100)
```

**Example:**
- Order total: €79.00 (7900 cents)
- Commission rate: 5%
- Commission: €3.95 (395 cents)

**Recording:**
```sql
INSERT INTO billable_events (
  tenant_id,
  merchant_id,
  event_type,      -- 'order'
  reference_id,    -- order.id
  amount_cents,    -- commission amount
  currency,
  occurred_at
)
```

### 6. Revenue Split (Multi-Tenant)

**Location:** Lines 203-221 of `webhooks.js`

If tenant has revenue share configured (e.g., 95% to tenant, 5% to platform):

```javascript
tenantCents = Math.round((commissionAmount * revenue_share_percent) / 100)
platformCents = commissionAmount - tenantCents
```

**Example:**
- Commission: €3.95 (395 cents)
- Revenue share: 95%
- Tenant gets: €3.75 (375 cents)
- Platform gets: €0.20 (20 cents)

**Recording:**
```sql
INSERT INTO revenue_splits (
  billable_event_id,
  tenant_id,
  merchant_id,
  total_cents,     -- 395
  tenant_cents,    -- 375
  platform_cents,  -- 20
  currency
)
```

### 7. Monthly Invoice Generation

**Worker Job:** `worker/jobs/generateInvoices.js`

**Schedule:** 1st of every month at 00:00 UTC

**Process:**
1. Finds all `billable_events` where `invoiced = false`
2. Groups by merchant
3. Sums commission amounts
4. Creates invoice in `invoices` table
5. Creates line items in `invoice_items` table
6. Marks `billable_events` as `invoiced = true`
7. If merchant has Stripe customer ID, auto-finalizes invoice

### 8. Merchant Payment

**Manual Process:**
- Admin views invoices in dashboard
- Admin marks invoice as "paid" after receiving payment
- Updates `invoices.status = 'paid'` and `paid_at = NOW()`

## Database Tables

### orders
Records completed orders from webhooks
```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id),
  merchant_id INTEGER REFERENCES merchants(id),
  checkout_session_id INTEGER REFERENCES checkout_sessions(id),
  referral_id UUID,
  merchant_order_id VARCHAR(255),  -- WooCommerce order ID
  revenue_cents INTEGER,           -- Order total
  currency VARCHAR(3),
  webhook_signature TEXT,
  verified BOOLEAN,
  referral_source VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### billable_events
Records commission charges
```sql
CREATE TABLE billable_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER,
  merchant_id INTEGER,
  event_type VARCHAR(50),          -- 'order' or 'click'
  reference_id INTEGER,            -- order.id or click_event.id
  amount_cents INTEGER,            -- Commission amount
  currency VARCHAR(3),
  occurred_at TIMESTAMP,
  invoiced BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### revenue_splits
Revenue sharing between tenant and platform
```sql
CREATE TABLE revenue_splits (
  id SERIAL PRIMARY KEY,
  billable_event_id INTEGER REFERENCES billable_events(id),
  tenant_id INTEGER,
  merchant_id INTEGER,
  total_cents INTEGER,             -- Total commission
  tenant_cents INTEGER,            -- Tenant's share
  platform_cents INTEGER,          -- Platform's share
  currency VARCHAR(3),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### invoices
Monthly invoices for merchants
```sql
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER,
  merchant_id INTEGER,
  period_start DATE,
  period_end DATE,
  subtotal_cents INTEGER,
  total_cents INTEGER,
  currency VARCHAR(3),
  status VARCHAR(50),              -- 'draft', 'finalized', 'paid'
  stripe_invoice_id VARCHAR(255),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Fraud Detection

**High-Value Orders** (Lines 106-126)
- Threshold: €100+ orders
- Action: Flag for manual review in `order_reviews` table
- Notification: Email to admin

**AOV Anomalies** (Lines 128-179)
- Detection: Orders >2 standard deviations below merchant average
- Requires: 10+ historical orders (statistical significance)
- Action: Flag for manual review
- Notification: Email to admin with z-score

**Note:** Commission is still calculated but should be verified before payout.

## Testing the Flow

### 1. Create Test Order
```bash
# Click "Buy Now" on marketplace
# Complete checkout on merchant site
# Merchant sends webhook
```

### 2. Verify Webhook Receipt
```sql
-- Check order recorded
SELECT * FROM orders WHERE referral_id = 'your-ref-id';

-- Check checkout session updated
SELECT * FROM checkout_sessions WHERE referral_id = 'your-ref-id';

-- Check billable event created
SELECT * FROM billable_events WHERE reference_id = (
  SELECT id FROM orders WHERE referral_id = 'your-ref-id'
);

-- Check revenue split (if tenant has revenue share)
SELECT * FROM revenue_splits WHERE billable_event_id = (
  SELECT id FROM billable_events WHERE reference_id = ...
);
```

### 3. Check Commission Calculation
```sql
-- View commission for specific order
SELECT
  o.merchant_order_id,
  o.revenue_cents / 100.0 as order_total_eur,
  be.amount_cents / 100.0 as commission_eur,
  (be.amount_cents::float / o.revenue_cents::float * 100) as commission_percent
FROM orders o
JOIN billable_events be ON be.reference_id = o.id
WHERE o.referral_id = 'your-ref-id';
```

### 4. Verify Invoice Generation (Monthly)
```bash
# Manually trigger invoice generation (for testing)
docker-compose exec api node worker/jobs/generateInvoices.js
```

```sql
-- Check invoice created
SELECT * FROM invoices WHERE merchant_id = X;

-- Check invoice items
SELECT * FROM invoice_items WHERE invoice_id = Y;

-- Verify billable events marked as invoiced
SELECT * FROM billable_events WHERE invoiced = true;
```

## Webhook Requirements for Merchant Plugin

The merchant's WordPress plugin MUST send the webhook after order completion.

**Webhook Configuration:**
- URL: `https://bizform.app/api/webhooks/order-completed`
- Method: POST
- Headers: `Content-Type: application/json`

**Payload Requirements:**
- `order_id`: WooCommerce order ID (string)
- `merchant_domain`: Merchant's domain (string)
- `referral_id`: UUID from checkout session (string)
- `total_cents`: Order total in cents (integer)
- `currency`: ISO currency code (string)
- `signature`: Ed25519 signature (base64 string)

**Signature Generation:**
```javascript
// Canonical payload (sorted keys)
const payload = {
  currency: "EUR",
  order_id: "12345",
  referral_id: "cd656f5c...",
  total_cents: 7900
};

// Sign with Ed25519 private key
const message = JSON.stringify(payload, Object.keys(payload).sort());
const signature = sign(message, privateKey);
const signatureBase64 = toBase64(signature);
```

## Commission Configuration

**Per-Merchant Configuration:**

Set in `merchant_billing` table:

```sql
UPDATE merchant_billing
SET
  billing_mode = 'commission',
  commission_percent = 5.0,  -- 5% commission
  cpc_rate_cents = 0
WHERE merchant_id = X;
```

**Billing Modes:**
- `commission`: % of order total (most common)
- `cpc`: Cost-per-click (rarely used)
- `freemium`: Free tier (no commission)

## Troubleshooting

### No Orders Recorded
**Check:**
1. Webhook endpoint accessible? `curl -X POST https://bizform.app/api/webhooks/order-completed`
2. Merchant plugin configured with correct webhook URL?
3. Merchant has valid public key in database?
4. Check API logs for webhook errors: `docker-compose logs api | grep Webhook`

### Commission Not Calculated
**Check:**
1. `merchant_billing` table has entry for merchant
2. `billing_mode = 'commission'`
3. `commission_percent > 0`
4. Check `billable_events` table for event creation

### Invoice Not Generated
**Check:**
1. Worker job running? `docker-compose logs api | grep generateInvoices`
2. Billable events exist with `invoiced = false`
3. Check `invoices` table for merchant
4. Check worker schedule (1st of month)

## Admin Dashboard Views

**Orders:**
- View all completed orders
- Filter by merchant, date range
- See order total, commission, status

**Billing:**
- View invoices per merchant
- Mark invoices as paid
- Download invoice PDF
- Send payment reminders

**Analytics:**
- Total revenue (order totals)
- Total commission (marketplace revenue)
- Commission by merchant
- Revenue share splits (tenant vs platform)

## API Endpoints

**Webhooks:**
- `POST /api/webhooks/order-completed` - Order completion webhook

**Admin:**
- `GET /admin/orders` - List all orders
- `GET /admin/invoices` - List all invoices
- `PATCH /admin/invoices/:id/paid` - Mark invoice as paid

**Public (for success page):**
- `GET /api/checkout/status?ref={referral_id}` - Check order status

## Related Documentation

- `docs/REDIRECT_CHECKOUT_FLOW.md` - Complete checkout flow
- `worker/jobs/generateInvoices.js` - Invoice generation logic
- `api/routes/webhooks.js` - Webhook handler source code

