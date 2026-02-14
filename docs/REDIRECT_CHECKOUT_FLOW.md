# Redirect Checkout Flow

## Overview

The marketplace now uses a **hybrid redirect flow** with return URLs and webhook confirmation. This replaces the previous embedded checkout (ECP/iframe) approach.

## Flow Diagram

```
User clicks Buy → Marketplace creates session → Redirect to merchant checkout
                                                   ↓
                   Webhook ← Merchant completes order ← User completes purchase
                      ↓                                  ↓
            Order recorded in DB                Return URL redirects user
                                                         ↓
                                          Success page (polls for confirmation)
```

## Implementation Details

### 1. Checkout Initiation (frontend/js/checkout.js)

**User Action:** Clicks "Buy Now" button

**Frontend:**
- POST `/api/checkout` with merchant_id, product_id, quantity
- Receives `checkout_url` with return URLs appended
- Stores referral_id in sessionStorage
- `window.location.href` redirects to merchant checkout

**Key Change:** No longer checks `embedded_checkout` flag. Always redirects.

### 2. API Session Creation (api/routes/public.js)

**Endpoint:** `POST /api/checkout`

**Process:**
1. Creates UCP checkout session with merchant's API
2. Receives checkout URL from merchant
3. Appends return URLs as query parameters:
   - `return_url`: `https://marketplace.com/checkout/success?ref={referralId}`
   - `cancel_url`: `https://marketplace.com/checkout/cancel?ref={referralId}`
4. Records session in `checkout_sessions` table
5. Returns `{checkout_url, referral_id, embedded_checkout: false}`

**Key Changes:**
- Removed ECP parameter injection (`ec_version`, `ec_delegate`)
- Always sets `embedded_checkout: false`
- Adds return URL parameters to all checkout URLs

### 3. Merchant Checkout

**Merchant Responsibility:**
- User completes checkout on merchant's site
- Merchant sends webhook when order complete (already implemented)
- Merchant redirects user to `return_url` (success) or `cancel_url` (cancelled)

**Return URL Format:**
- Success: `https://marketplace.com/checkout/success?ref={referralId}`
- Cancel: `https://marketplace.com/checkout/cancel?ref={referralId}`

### 4. Webhook Confirmation (api/routes/webhooks.js)

**Already Implemented:** Webhook endpoint exists and processes order completion

**Endpoint:** `POST /api/webhooks/order`

**Process:**
1. Receives order data from merchant
2. Verifies UCP signature
3. Creates record in `orders` table with referral_id
4. Updates `checkout_sessions` status to 'completed'

**No changes needed** - webhook flow already works correctly.

### 5. Success Page (frontend/checkout-success.html)

**URL:** `/checkout/success?ref={referralId}`

**Features:**
- Shows success message immediately
- Polls `/api/checkout/status?ref={referralId}` every 3 seconds
- Displays order confirmation when webhook received
- Falls back gracefully if webhook delayed
- Auto-stops polling after 30 seconds (10 attempts)

**Status Endpoint:** `GET /api/checkout/status`

**Response:**
```json
{
  "status": "completed",
  "order_id": "12345"
}
```

### 6. Cancel Page (frontend/checkout-cancel.html)

**URL:** `/checkout/cancel?ref={referralId}`

**Features:**
- Shows cancellation message
- Logs cancellation via `POST /api/checkout/cancel`
- Updates session status to 'cancelled'
- Provides links back to marketplace

## Database Tables

### checkout_sessions
- `referral_id` - Unique session identifier
- `status` - created → completed/cancelled
- `session_url` - Merchant checkout URL (with return URLs)

### orders
- `referral_id` - Links to checkout session
- `external_order_id` - Merchant's order ID
- Created by webhook

## Benefits Over Embedded Checkout

1. **No CSP Issues** - Full page redirect avoids iframe restrictions
2. **No Cookie Problems** - No SameSite issues with redirect flow
3. **Simpler Implementation** - No ECP protocol complexity
4. **Better Mobile UX** - Full screen checkout on merchant site
5. **Merchant Control** - Merchants handle entire checkout experience
6. **Webhook Confirmation** - Reliable order confirmation independent of user return

## Webhook + Return URL Strategy

**Why both?**
- **Webhook**: Authoritative source of truth for order completion
- **Return URL**: Immediate user feedback (UX) while webhook processes

**Timing:**
1. User completes checkout on merchant site
2. Merchant sends webhook (async, may take 1-5 seconds)
3. Merchant redirects user to return URL (immediate)
4. Success page polls status API
5. Status API checks for order record from webhook
6. Page updates when webhook confirms order

**Edge Cases:**
- Webhook arrives before user returns: Status shows "completed" immediately
- User returns before webhook: Status shows "pending", then updates on poll
- Webhook fails: Status remains "pending", user sees "processing" message
- User closes browser: Webhook still records order (no UX feedback but order exists)

## Testing Checklist

- [ ] Buy Now button redirects to merchant checkout
- [ ] Return URLs present in checkout URL query params
- [ ] Merchant redirects to success page after purchase
- [ ] Success page polls for status
- [ ] Webhook updates order status
- [ ] Success page shows order confirmation
- [ ] Cancel URL works for abandoned checkouts
- [ ] Cancellation logged in database
- [ ] No embedded iframe/modal appears

## Migration Notes

**Files Modified:**
- `api/routes/public.js` - Removed ECP params, added return URLs, set embedded_checkout=false
- `frontend/js/checkout.js` - Removed embedded logic, always redirect
- `frontend/Dockerfile` - Added checkout HTML files

**Files Created:**
- `frontend/checkout-success.html` - Success landing page
- `frontend/checkout-cancel.html` - Cancel landing page
- `api/routes/public.js` - Added `/checkout/status` and `/checkout/cancel` endpoints

**Files Unchanged:**
- `api/routes/webhooks.js` - Webhook flow already correct
- `frontend/js/embedded-checkout.js` - Still exists but unused (can be archived)
- `docs/EMBEDDED_CHECKOUT_*.md` - Now obsolete (can be archived)

## Future Enhancements

1. **Order Tracking Page** - Allow users to check order status by referral ID
2. **Email Confirmation** - Send email when webhook confirms order
3. **Retry Logic** - Auto-retry webhook on failure
4. **Admin Dashboard** - Show pending vs completed sessions
5. **Timeout Handling** - Mark abandoned sessions after 1 hour

## Troubleshooting

### User sees "pending" forever on success page
**Cause:** Webhook not received or failed
**Check:**
- Webhook endpoint configured correctly in merchant plugin
- Webhook logs in API for errors
- Orders table for matching referral_id

### Redirect loop or blank page
**Cause:** Return URL misconfigured
**Check:**
- Return URLs properly URL-encoded
- Merchant plugin uses return_url parameter
- No conflicting redirects in nginx

### Session not found error
**Cause:** Referral ID mismatch or session not created
**Check:**
- checkout_sessions table has record
- referral_id matches between URL and database
- Session creation didn't fail silently

## Deployment

1. Rebuild frontend Docker image (includes new HTML files)
2. Rebuild API Docker image (includes new endpoints)
3. No database migrations needed
4. No merchant plugin changes required (return URLs standard in UCP)
5. Test complete flow in staging before production

```bash
docker-compose build frontend api
docker-compose up -d frontend api
```

## Related Documentation

- UCP 2026 Specification - Checkout Session Creation
- Webhook Authentication - UCP Signature Verification
- Return URL Standard - Query parameter format

