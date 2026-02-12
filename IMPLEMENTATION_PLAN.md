# UCP Multi-Tenant Merchant Platform - Implementation Plan

## Overview

Create a complete multi-tenant merchant platform solution that allows ANY UCP-compliant WooCommerce store to be added, have their products indexed (including variations), and enable embedded checkout sessions from the marketplace.

**User's Example (test.zologic.nl):**
- UCP manifest at `/.well-known/ucp`
- Products API: `/wp-json/ucpready/v1/products`
- OpenAPI schema: `/wp-json/ucpready/v1/openapi.json`
- Has variable products with variations
- Supports embedded checkout capability

## Analysis Summary

Based on codebase exploration, the platform **already has 90%** of the required infrastructure:

### ✅ Existing Capabilities
1. **Merchant onboarding flow** (`api/routes/onboard.js`)
   - UCP manifest detection at `/.well-known/ucp`
   - Store detection and validation
   - Status tracking (pending → verified → active)

2. **Product indexing worker** (`worker/jobs/indexProducts.js`)
   - Scheduled every 6 hours
   - Dynamic UCP capability discovery
   - Product variations transformation (UCP 2026 format)
   - Upsert logic with conflict handling

3. **UCP parser** (`api/utils/ucpParser.js`)
   - Supports both old and new UCP schemas
   - Capability discovery
   - Ed25519 signature verification
   - Business profile extraction

4. **Embedded checkout** (`frontend/js/embedded-checkout.js`)
   - PostMessage protocol
   - iframe integration
   - Referral tracking
   - Order webhook handling

5. **Variation support** (Migration `002_add_product_variations.sql`)
   - JSONB variations column
   - GIN indexes for variation queries
   - Checkout validation logic

### ⚠️ Minor Gaps to Address

1. **Admin UI** - Add manual indexing trigger button
2. **Variation UI** - Better frontend display of product variations
3. **Testing docs** - Guide for adding test merchants

---

## Implementation Plan

Since most infrastructure exists, we'll focus on polish and usability improvements.

### Phase 1: Admin Merchant Management Enhancements

**Goal:** Add manual product indexing control to admin UI

**Files to modify:**
1. `api/routes/admin.js` - Add POST endpoint for manual indexing
2. `admin/src/api/client.js` - Add triggerMerchantIndex() function
3. `admin/src/pages/Merchants.jsx` - Add "Re-index Products" button

**Implementation:**

**Backend** (`api/routes/admin.js` - add after line 250):
```javascript
// POST /admin/merchants/:id/index - Trigger product indexing
router.post('/merchants/:id/index', requireAuth, async (req, res) => {
    const { id } = req.params;

    // Validate merchant exists and is active
    const merchant = await req.app.locals.db.query(
        'SELECT id, domain, status FROM merchants WHERE id = $1',
        [id]
    );

    if (merchant.rows.length === 0) {
        return res.status(404).json({ error: 'Merchant not found' });
    }

    if (merchant.rows[0].status !== 'active') {
        return res.status(400).json({ error: 'Merchant must be active' });
    }

    // Trigger async indexing
    const { indexMerchantProducts } = require('../../worker/jobs/indexProducts');

    indexMerchantProducts(req.app.locals.db, req.app.locals.redis, id)
        .catch(err => console.error(`Indexing failed:`, err));

    res.json({ success: true, message: 'Indexing started' });
});
```

**Frontend API** (`admin/src/api/client.js` - add after line 108):
```javascript
export const triggerMerchantIndex = (id) => {
  return apiClient.post(`/merchants/${id}/index`);
};
```

**Frontend UI** (`admin/src/pages/Merchants.jsx` - enhance merchant actions):
- Add "Re-index" button to each merchant row
- Show loading state while indexing
- Display last indexed timestamp
- Show product count

---

### Phase 2: Product Variation UI Enhancement

**Goal:** Show variation selectors in product cards

**Files to modify:**
1. `frontend/js/ui.js` - Enhance renderProductCard()
2. `frontend/styles.css` - Add variation selector styles

**Implementation:**

**UI Enhancement** (`frontend/js/ui.js` - enhance renderProductCard function):
```javascript
function renderProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';

    // ... existing image and name ...

    // Add variations if present
    if (product.has_variations && product.variations && product.variations.length > 0) {
        const variationsContainer = document.createElement('div');
        variationsContainer.className = 'variations-container';

        product.variations.forEach(variation => {
            const selector = document.createElement('div');
            selector.className = 'variation-selector';

            const label = document.createElement('label');
            label.textContent = variation.attribute + ':';

            const select = document.createElement('select');
            select.dataset.attribute = variation.attribute;
            select.required = true;

            // Add placeholder option
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = `Select ${variation.attribute}`;
            select.appendChild(placeholder);

            // Add options
            variation.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.value;
                option.disabled = !opt.available;
                if (opt.price_modifier_cents && opt.price_modifier_cents !== 0) {
                    option.textContent += ` (+€${(opt.price_modifier_cents / 100).toFixed(2)})`;
                }
                select.appendChild(option);
            });

            selector.appendChild(label);
            selector.appendChild(select);
            variationsContainer.appendChild(selector);
        });

        card.appendChild(variationsContainer);
    }

    // ... rest of card ...
}
```

**Styles** (`frontend/styles.css` - add):
```css
.variations-container {
    margin: 10px 0;
    padding: 10px;
    background: #f9f9f9;
    border-radius: 4px;
}

.variation-selector {
    margin-bottom: 8px;
}

.variation-selector label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
    color: #555;
}

.variation-selector select {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}
```

---

### Phase 3: Documentation

**Goal:** Create merchant onboarding guide

**Files to create:**
1. `docs/MERCHANT_ONBOARDING.md` - Step-by-step guide
2. `docs/TESTING_GUIDE.md` - How to test with test.zologic.nl

**Content Structure:**

**MERCHANT_ONBOARDING.md:**
- Prerequisites (WooCommerce + UCPReady plugin)
- Adding merchant via admin UI
- UCP manifest requirements
- Product indexing process
- Troubleshooting common issues

**TESTING_GUIDE.md:**
- Using test.zologic.nl as example
- Step-by-step test flow
- Verification checklist
- Expected results

---

## Critical Files Reference

### Existing (Reuse)
- `api/routes/onboard.js` - Merchant onboarding (complete)
- `worker/jobs/indexProducts.js` - Product indexing (complete)
- `api/utils/ucpParser.js` - UCP parsing (complete)
- `frontend/js/embedded-checkout.js` - Checkout (complete)
- `api/routes/webhooks.js` - Order webhooks (complete)

### To Modify
- `api/routes/admin.js` - Add manual indexing endpoint
- `admin/src/api/client.js` - Add API function
- `admin/src/pages/Merchants.jsx` - Add UI button
- `frontend/js/ui.js` - Enhance product cards
- `frontend/styles.css` - Add variation styles

### To Create
- `docs/MERCHANT_ONBOARDING.md` - Documentation
- `docs/TESTING_GUIDE.md` - Testing guide

---

## End-to-End Test Flow

### 1. Add Test Merchant (via Admin UI)
- Navigate to Admin → Merchants → Add Merchant
- Enter domain: `test.zologic.nl`
- System detects UCP support
- Merchant status: `pending_verification`

### 2. Verify Merchant
- System fetches UCP manifest
- Verifies signing keys
- Updates status to `active`

### 3. Index Products
- Click "Re-index Products" button
- Worker fetches from `/wp-json/ucpready/v1/products`
- Parses 2 products (including variations)
- Stores in database

### 4. Search Products
- Frontend search: "test" or "awesome"
- Both products appear in results
- Variations shown in product cards

### 5. Test Checkout
- Click "Buy Now" on variable product
- Select variations (e.g., Color: Blue)
- Embedded checkout opens in iframe
- Complete purchase
- Webhook received with referral_id
- Order tracked in database

### 6. Verify Analytics
- Admin → Analytics
- See searches, clicks, conversions
- Test merchant appears in top merchants

---

## Success Criteria

- ✅ Any UCP merchant can be added (not hardcoded)
- ✅ Products automatically indexed with variations
- ✅ Variations display correctly in UI
- ✅ Search works across all merchants
- ✅ Embedded checkout functions
- ✅ Order webhooks tracked
- ✅ Admin can manually trigger indexing
- ✅ Multi-tenant architecture maintained

---

## Risk Assessment

**Low Risk:**
- 90% of code already exists and works
- Changes are UI/UX enhancements
- No database schema changes needed

**Medium Risk:**
- Variation UI complexity
- Must test with multiple merchants

**Mitigation:**
- Start simple with variation UI
- Test thoroughly with test.zologic.nl
- Gradual rollout to other merchants

---

## Timeline Estimate

- **Phase 1** (Admin UI): 2 hours
- **Phase 2** (Variation UI): 2-3 hours
- **Phase 3** (Documentation): 1 hour

**Total**: 5-6 hours

---

## Verification Steps

1. **Merchant Onboarding**
   - [ ] Add test.zologic.nl via admin UI
   - [ ] Merchant status updates correctly
   - [ ] UCP manifest parsed

2. **Product Indexing**
   - [ ] Click "Re-index Products"
   - [ ] Products appear in database
   - [ ] Variations stored correctly

3. **Search & Display**
   - [ ] Products appear in search results
   - [ ] Variation selectors visible
   - [ ] Price updates with modifiers

4. **Checkout Flow**
   - [ ] Embedded checkout opens
   - [ ] Can complete purchase
   - [ ] Webhook received
   - [ ] Order tracked

5. **Analytics**
   - [ ] Metrics update correctly
   - [ ] Merchant appears in reports
   - [ ] Referral attribution works
