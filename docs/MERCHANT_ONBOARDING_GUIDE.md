# Merchant Onboarding Guide

## Overview

This guide explains how to add UCP-compliant WooCommerce merchants to your marketplace platform. The platform supports **any merchant** with WooCommerce + UCPReady plugin installed.

## Prerequisites

Merchants must have:
1. **WooCommerce** installed and active
2. **UCPReady plugin** installed and activated
3. Valid **UCP manifest** at `/.well-known/ucp`
4. **Signing keys** configured (Ed25519)

## Example Merchant

Test with: **test.zologic.nl**
- UCP Manifest: https://test.zologic.nl/.well-known/ucp
- Products API: https://test.zologic.nl/wp-json/ucpready/v1/products
- Has 2 products including variable product with variations

---

## Step-by-Step Onboarding

### 1. Add Merchant via Admin UI

1. Navigate to **Admin Dashboard** → **Merchants**
2. Click **"Add Merchant"** button
3. Enter merchant domain (e.g., `test.zologic.nl`)
4. System automatically:
   - Detects WooCommerce + UCPReady installation
   - Fetches UCP manifest from `/.well-known/ucp`
   - Verifies signing keys
   - Extracts business profile
   - Sets status to `pending_verification` or `verified`

### 2. Index Products

Once merchant is verified:

1. Find merchant in the list
2. Click **"Index Products"** button
3. System will:
   - Fetch products from UCP products API
   - Parse product variations (if any)
   - Store in database with search indexing
   - Update merchant product count

**Note**: Indexing runs in the background (may take 1-2 minutes for large catalogs)

### 3. Verify in Frontend

1. Open your marketplace frontend
2. Search for products from the merchant
3. Verify products appear in results
4. Check that variations display correctly

### 4. Test Checkout Flow

1. Click "Buy Now" on a product
2. **Embedded Checkout** should open (if merchant supports it)
3. Complete test purchase
4. Verify webhook received in Admin → Analytics

---

## UCP Manifest Requirements

Merchants must provide a valid UCP manifest at `/.well-known/ucp`:

```json
{
  "ucp": {
    "version": "2026-01-23",
    "services": {
      "dev.ucp.shopping": [{
        "version": "2026-01-23",
        "transport": "rest",
        "endpoint": "https://example.com/wp-json/ucpready/v1"
      }]
    },
    "capabilities": [
      {
        "name": "dev.ucp.shopping.products",
        "supported": true
      },
      {
        "name": "dev.ucp.shopping.embedded_checkout",
        "supported": true,
        "endpoint": "https://example.com/checkout-embed"
      }
    ]
  },
  "signing_keys": [{
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "base64_public_key",
    "use": "sig",
    "alg": "EdDSA",
    "kid": "key_id"
  }]
}
```

### Key Fields

- **services.dev.ucp.shopping.endpoint** - Base URL for products API
- **capabilities.dev.ucp.shopping.products** - Must be supported
- **capabilities.dev.ucp.shopping.embedded_checkout** - Optional but recommended
- **signing_keys** - Ed25519 public key for webhook verification

---

## Commission & Billing

### Default Settings

New merchants default to **freemium** (no commission).

### Setting Commission Rate

1. Go to Admin → Merchants → Edit
2. Set billing mode to **"commission"**
3. Set commission percentage (e.g., 5%)
4. Commissions automatically calculated on completed orders

### Viewing Commission Earnings

1. Admin → Analytics
2. View **"Commission by Tenant"** chart
3. Export CSV for detailed breakdown

---

## Product Variations

The platform automatically handles product variations:

### Backend Transformation

The indexer transforms UCP variation format:

```json
{
  "id": "prod-123",
  "name": "T-Shirt",
  "has_variations": true,
  "variations": [
    {
      "id": "var-1",
      "attributes": {
        "Color": "Blue",
        "Size": "L"
      },
      "price": 1500,
      "available": true
    }
  ]
}
```

Into marketplace format:

```json
{
  "variations": [
    {
      "attribute": "Color",
      "options": [
        {
          "value": "Blue",
          "available": true,
          "variation_id": "var-1",
          "price_modifier_cents": 0
        }
      ]
    },
    {
      "attribute": "Size",
      "options": [
        {
          "value": "L",
          "available": true,
          "variation_id": "var-1",
          "price_modifier_cents": 0
        }
      ]
    }
  ]
}
```

### Frontend Display

- Variation selectors automatically shown in product cards
- Price updates based on selected options
- Unavailable options disabled
- Validation on checkout

---

## Embedded Checkout

### How It Works

1. User clicks "Buy Now"
2. Platform checks UCP manifest for `embedded_checkout` capability
3. If supported → Opens checkout in iframe overlay
4. If not → Redirects to merchant checkout page

### PostMessage Communication

Embedded checkout uses PostMessage protocol:

**Marketplace → Merchant:**
- `ec.marketplace.ready` - Iframe ready, includes referral_id

**Merchant → Marketplace:**
- `ec.ready` - Merchant loaded
- `ec.checkout.complete` - Order completed
- `ec.checkout.cancelled` - User cancelled
- `ec.checkout.error` - Error occurred

### Referral Tracking

- Every checkout includes unique `referral_id` (UUID)
- Embedded in checkout URL: `?ref=uuid`
- Merchant includes in webhook to track attribution
- Platform uses for commission calculation

---

## Order Webhooks

### Webhook Endpoint

Merchants send order completion webhooks to:

```
POST /api/webhooks/order-completed
```

### Required Fields

```json
{
  "order_id": "order-123",
  "merchant_domain": "test.zologic.nl",
  "referral_id": "uuid-from-checkout",
  "total_cents": 1500,
  "currency": "EUR",
  "signature": "ed25519_signature"
}
```

### Signature Verification

Platform verifies Ed25519 signature using merchant's public key:

```javascript
const message = { order_id, referral_id, total_cents, currency };
const isValid = verifySignature(message, signature, merchant.public_key);
```

---

## Automated Indexing

### Background Worker

The platform runs a background worker that:
- Re-indexes all active merchants **every 6 hours**
- Updates product availability
- Adds new products
- Removes deleted products

### Manual Indexing

Use the **"Index Products"** button when:
- Merchant just added new products
- Product data changed significantly
- Testing integration
- Troubleshooting issues

---

## Troubleshooting

### Merchant Not Found

**Error**: "Unable to detect UCP support"

**Solutions**:
1. Verify WooCommerce is installed
2. Check UCPReady plugin is activated
3. Ensure `/.well-known/ucp` is accessible
4. Check for CORS issues

### Products Not Indexing

**Error**: "Products endpoint not found"

**Solutions**:
1. Verify products API endpoint in UCP manifest
2. Check API returns valid JSON
3. Ensure products have required fields (id, name, price)
4. Check server logs for detailed errors

### Embedded Checkout Not Working

**Symptoms**: Redirects instead of showing iframe

**Solutions**:
1. Check `embedded_checkout` capability in manifest
2. Verify endpoint URL is correct
3. Test postMessage communication
4. Check browser console for errors

### Webhooks Not Received

**Symptoms**: Orders not tracked in analytics

**Solutions**:
1. Verify webhook endpoint is accessible
2. Check Ed25519 signature generation
3. Ensure referral_id matches checkout session
4. Check server logs for webhook errors

---

## Multi-Tenant Support

The platform supports multiple tenants (white-label deployments):

### Tenant Isolation

- Each merchant belongs to one tenant
- Products filtered by tenant_id
- Analytics segregated by tenant
- Commission tracked per tenant

### Adding Merchants to Tenant

When creating merchant, specify `tenant_id`:

```json
{
  "domain": "test.zologic.nl",
  "tenant_id": "tenant-uuid"
}
```

---

## Best Practices

### For Platform Operators

1. **Monitor indexing logs** - Check for failed indexing attempts
2. **Review commission rates** - Ensure competitive but profitable
3. **Test checkout flow** - Verify end-to-end regularly
4. **Monitor webhook delivery** - Set up alerts for failures

### For Merchants

1. **Keep UCPReady plugin updated** - Latest features and fixes
2. **Test embedded checkout** - Better conversion rates
3. **Provide accurate product data** - Improve search relevance
4. **Monitor webhook delivery** - Ensure orders tracked

---

## API Reference

### POST /api/onboard/detect

Detect UCP support for a domain.

**Request**:
```json
{
  "domain": "test.zologic.nl",
  "tenant_id": "tenant-uuid"
}
```

**Response**:
```json
{
  "status": "verified",
  "merchant_id": "uuid",
  "business_profile": {
    "name": "Test Shop",
    "description": "...",
    "url": "https://test.zologic.nl"
  }
}
```

### POST /admin/merchants/:id/index

Trigger product indexing for a merchant.

**Response**:
```json
{
  "success": true,
  "message": "Product indexing started",
  "merchant_id": "uuid",
  "domain": "test.zologic.nl"
}
```

---

## Success Checklist

Before going live with a merchant:

- [ ] Merchant added via admin UI
- [ ] UCP manifest validated
- [ ] Products indexed successfully
- [ ] Products appear in search
- [ ] Variations display correctly
- [ ] Embedded checkout opens
- [ ] Test order completed
- [ ] Webhook received
- [ ] Order tracked in analytics
- [ ] Commission calculated correctly

---

## Support

For issues or questions:
- Check server logs: `docker-compose logs api`
- Review indexing logs in database: `merchant_index_log` table
- Test UCP manifest: `curl https://merchant.com/.well-known/ucp`
- Verify products API: `curl https://merchant.com/wp-json/ucpready/v1/products`
