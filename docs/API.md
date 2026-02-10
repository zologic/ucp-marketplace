# API Documentation

## Base URL

All API endpoints are relative to the base URL:

```
https://your-domain.com/api
```

## Authentication

### Admin Endpoints

Admin endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

To obtain a token, use the `/admin/login` endpoint.

## Public Endpoints

### POST /api/search

Search for products across active merchants.

**Request:**

```json
{
  "query": "SOHO shirt under 20 EUR",
  "filters": {
    "category": "apparel",
    "brand": "SOHO",
    "max_price_cents": 2000,
    "currency": "EUR"
  }
}
```

**Response:**

```json
{
  "results": [
    {
      "id": "uuid",
      "merchant_id": "uuid",
      "merchant_name": "Fashion Store",
      "name": "SOHO Blue Shirt",
      "price_cents": 1900,
      "currency": "EUR",
      "image_url": "https://...",
      "stock_status": "in_stock"
    }
  ],
  "count": 15
}
```

**Status Codes:**
- 200: Success
- 400: Invalid request
- 404: Tenant not found
- 500: Server error

---

### POST /api/checkout

Create a checkout session for a product.

**Request:**

```json
{
  "merchant_id": "uuid",
  "product_id": "uuid",
  "quantity": 1
}
```

**Response:**

```json
{
  "checkout_url": "https://merchant.com/checkout?ref=uuid",
  "referral_id": "uuid"
}
```

**Status Codes:**
- 200: Success
- 400: Invalid request or product out of stock
- 403: Merchant not available
- 404: Merchant or product not found
- 500: Server error

---

### POST /api/webhooks/order-completed

Webhook endpoint for order completion (called by UCPReady plugin).

**Request:**

```json
{
  "order_id": "wc_order_123",
  "merchant_domain": "https://merchant.com",
  "referral_id": "uuid",
  "total_cents": 2500,
  "currency": "EUR",
  "signature": "ed25519_signature"
}
```

**Response:**

```json
{
  "status": "ok",
  "order_id": "uuid"
}
```

**Status Codes:**
- 200: Success
- 400: Invalid signature or missing fields
- 404: Referral ID not found
- 409: Order already recorded

---

## Admin Endpoints

### POST /admin/login

Authenticate admin user.

**Request:**

```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

**Response:**

```json
{
  "token": "jwt-token",
  "admin": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

**Status Codes:**
- 200: Success
- 401: Invalid credentials
- 500: Server error

---

### GET /admin/merchants

List all merchants (requires authentication).

**Query Parameters:**
- `tenant_id` (optional): Filter by tenant
- `status` (optional): Filter by status (pending, verified, active, suspended)
- `search` (optional): Search by domain
- `limit` (optional): Page size (default: 50)
- `offset` (optional): Page offset (default: 0)

**Response:**

```json
{
  "merchants": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "domain": "https://merchant.com",
      "status": "active",
      "billing_status": "active",
      "last_verified_at": "2026-02-10T10:00:00Z"
    }
  ],
  "count": 42
}
```

---

### POST /admin/merchants

Add a new merchant (requires authentication).

**Request:**

```json
{
  "domain": "https://merchant.com",
  "tenant_id": "uuid",
  "auto_verify": true
}
```

**Response:**

```json
{
  "merchant": {
    "id": "uuid",
    "domain": "https://merchant.com",
    "status": "pending",
    "created_at": "2026-02-10T10:00:00Z"
  }
}
```

**Status Codes:**
- 201: Created
- 400: Invalid request
- 409: Merchant already exists

---

### POST /admin/merchants/:id/verify

Trigger UCP verification for a merchant.

**Response:**

```json
{
  "status": "verified",
  "ucp_endpoint": "https://merchant.com/.well-known/ucp",
  "public_key": "ed25519_key...",
  "verified_at": "2026-02-10T10:05:00Z"
}
```

Or on failure:

```json
{
  "status": "failed",
  "error": "UCP endpoint not found"
}
```

---

### POST /admin/merchants/:id/activate

Activate a merchant (make searchable).

**Response:**

```json
{
  "status": "active",
  "activated_at": "2026-02-10T10:10:00Z"
}
```

---

### POST /admin/merchants/:id/suspend

Suspend a merchant (remove from search).

**Response:**

```json
{
  "status": "suspended",
  "suspended_at": "2026-02-10T10:15:00Z"
}
```

---

### GET /admin/merchants/:id/analytics

Get analytics for a specific merchant.

**Query Parameters:**
- `period`: 'day', 'week', 'month', 'year' (optional)
- `start_date`: Start of custom range (YYYY-MM-DD)
- `end_date`: End of custom range (YYYY-MM-DD)

**Response:**

```json
{
  "period": {
    "start": "2026-02-01",
    "end": "2026-02-10"
  },
  "summary": {
    "search_count": 1234,
    "click_count": 456,
    "checkout_count": 123,
    "order_count": 89,
    "revenue_cents": 123456,
    "conversion_rate": 19.5
  }
}
```

---

### POST /admin/mcp/reload

Trigger MCP hot reload.

**Response:**

```json
{
  "status": "reloaded",
  "reloaded_at": "2026-02-10T10:20:00Z"
}
```

---

## Internal Endpoints

**Note:** These endpoints are for service-to-service communication only and should NOT be publicly exposed.

### GET /internal/active-merchants

Get active merchants for MCP server.

**Query Parameters:**
- `tenant_id` (required): Tenant UUID

**Response:**

```json
{
  "merchants": [
    {
      "id": "uuid",
      "domain": "https://merchant.com",
      "ucp_endpoint": "https://merchant.com/.well-known/ucp",
      "public_key": "ed25519_key..."
    }
  ],
  "count": 42,
  "cached_at": "2026-02-10T10:00:00Z"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message"
}
```

Common HTTP status codes:
- 400: Bad Request (invalid input)
- 401: Unauthorized (missing or invalid token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 409: Conflict (duplicate resource)
- 500: Internal Server Error

## Rate Limiting

Public API endpoints are rate-limited to:
- 100 requests per minute per IP address

Admin endpoints:
- 300 requests per minute per token

Exceeding the limit returns HTTP 429 (Too Many Requests).

## Webhooks

### Order Completion Webhook

UCPReady WooCommerce plugin sends webhooks to:

```
POST https://your-domain.com/api/webhooks/order-completed
```

**Signature Verification:**

Webhooks are signed using Ed25519. The signature is included in the `signature` field of the request body.

To verify:

1. Create canonical JSON string from payload (sorted keys)
2. Verify signature using merchant's public key
3. Reject if signature is invalid

## CORS

The API supports CORS for cross-origin requests. Allowed origins are configurable via `CORS_ORIGIN` environment variable.

Default: All origins allowed in development, restricted in production.

## Content Type

All requests must use `Content-Type: application/json` except for webhooks which may vary.

All responses are `Content-Type: application/json`.
