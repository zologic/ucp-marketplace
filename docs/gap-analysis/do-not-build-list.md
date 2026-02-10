# UCPReady AI Commerce Directory: "Do NOT Build" List

**Analysis Date:** February 10, 2026
**Platform:** UCPReady AI Commerce Directory
**Purpose:** Explicit list of features that would weaken moats, commoditize the platform, or attract wrong merchants

---

## Executive Summary

This document lists features that **must NOT be built** despite potential user requests or competitive pressure. Building these features would:
1. Weaken competitive moats (make differentiation portable)
2. Commoditize the platform (turn unique assets into generic utilities)
3. Attract wrong merchants (optimize for quantity over quality)
4. Create unsustainable regulatory/compliance burdens

**Key Principle:** Not all features add value. Some features **destroy** value by weakening defensibility or attracting bad actors.

**Enforcement:** This is a BLOCKING list. Any feature on this list requires executive approval and explicit moat mitigation strategy before development.

---

## Category 1: Features That Would Weaken Moats

### ❌ 1. Export Merchant Trust Score

**What it is:**
API endpoint or data export that allows merchants to download their trust score and take it to competitor platforms.

**Why harmful:**
- **Kills reputation moat** — Trust score is non-portable by design. If merchants can export it, they can rebuild reputation elsewhere instantly.
- **Zero switching cost** — Merchant with 5-star trust on UCPReady can launch on competitor with same 5-star trust Day 1.
- **No lock-in** — Platform loses primary retention mechanism (reputation takes 12 months to build, cannot be transferred).

**Current state:**
Trust score doesn't exist yet (Gap 2). When built, MUST remain locked to platform.

**Alternative approach:**
- Allow merchant to display **"5-star on UCPReady"** badge on their website (keeps score on platform)
- Provide embeddable widget showing trust score (links back to UCPReady profile)
- Public merchant profile page on UCPReady (shareable URL, not exportable data)

**Approval requirement:**
If ever requested, require CEO approval + moat mitigation plan.

---

### ❌ 2. Public API for Intent Analytics (Aggregated Cross-Merchant Data)

**What it is:**
Public or merchant-accessible API endpoint that returns aggregated intent viability data across all merchants (e.g., "eco t-shirt under €30" converts at 8% industry-wide).

**Why harmful:**
- **Competitors scrape insights** — Competitors call API, get intent intelligence, replicate without accumulating data themselves.
- **Data moat destroyed** — The ONE defensible asset (cross-merchant intent intelligence) becomes public good.
- **No competitive advantage** — If everyone has access to intent viability data, nobody has advantage.

**Current state:**
Intent hash dormant (Gap 8). When activated, MUST remain internal-only or merchant-specific.

**Alternative approach:**
- **Merchant-specific intent reports** (paid feature) — Show "YOUR products for 'eco t-shirt'" performance, NOT industry-wide data.
- **Anonymized aggregate benchmarking** — "Your conversion rate: 2.3%, category average: 5.1%" (relative, not absolute patterns).
- **Gated access** — Merchant must contribute data (have active products) to access insights (pay-to-play).

**Never expose:**
- Raw intent hashes (reverse-engineering risk)
- Granular intent conversion rates across all merchants
- Time-series intent trends (competitive intelligence)

**Approval requirement:**
If public API ever proposed, require CTO + CEO approval + data obfuscation strategy.

---

### ❌ 3. Generic Ranking Algorithm (Freshness Only)

**What it is:**
Continuing to rank products by `ORDER BY indexed_at DESC` without using performance data (conversion rate, trust score).

**Why harmful:**
- **No data advantage** — Any competitor can replicate freshness-only ranking trivially.
- **Commodity search** — Platform becomes "WooCommerce aggregator with no intelligence."
- **No consequences** — Good and bad merchants get identical visibility, no incentive to improve.

**Current state:**
**THIS IS WHAT EXISTS TODAY** (`routes/public.js:78` — `ORDER BY p.indexed_at DESC`).

**Action:**
**FIX IMMEDIATELY** — This is Gap 1 (Critical). Activate performance-aware ranking Week 1.

**Alternative approach:**
- Performance-aware ranking: `(conversion_rate * trust_score * 0.95) + (freshness_score * 0.05)`
- Preserve 5% exploration (freshness + diversity) to prevent overfitting
- Minimum sample size: rank by freshness if <10 clicks (avoid premature optimization)

**Approval requirement:**
N/A — This must be FIXED, not preserved. No approval needed to implement performance-aware ranking.

---

### ❌ 4. Allow Merchants to Bypass Trust Score (Pay for Visibility)

**What it is:**
"Featured listings" or "promoted products" that allow low-trust merchants to buy their way to top of search results, bypassing organic trust-based ranking.

**Why harmful:**
- **Trust system becomes meaningless** — Bad actors avoid consequences by paying.
- **Consumer trust erosion** — Users click promoted listings, have bad experiences, lose faith in platform.
- **Adverse selection** — Bad merchants who NEED to pay for visibility (because organic trust is low) are exactly the merchants who should be suppressed.

**Current state:**
No trust scoring exists yet (Gap 2). When built, MUST affect visibility without bypass.

**Alternative approach:**
- Admin override for false positives (logged and reviewed) — Manual intervention for legitimate merchants flagged incorrectly.
- Trust score improvement pathway — Merchant can improve trust by improving performance, not by paying.
- No "pay to win" mechanisms — Organic ranking only (trust + performance).

**Acceptable exception:**
Sponsored listings that are CLEARLY LABELED as ads and DON'T displace organic results (e.g., "Sponsored" banner at top, then organic results below).

**Approval requirement:**
If "featured listings" ever proposed, require product + CEO approval + consumer trust impact analysis.

---

## Category 2: Features That Would Commoditize Platform

### ❌ 5. Open-Source Entire Platform Without Data Moat Active

**What it is:**
Releasing complete codebase as Apache 2.0 (current license) BEFORE activating data moats (performance-aware ranking, trust scoring, intent intelligence).

**Why harmful:**
- **Enables exact clones** — Competitor forks repo, deploys, launches competing directory Day 1.
- **First-mover advantage lost** — No differentiation, no data advantage, pure operational execution battle.
- **Race to bottom** — Commoditized technology → price competition → margin compression.

**Current state:**
**ALREADY APACHE 2.0 LICENSED** — Code is already open-source.

**Mitigation:**
- Open-source is acceptable IF data moat is activated first (Gap 1 + Gap 2, Week 1-2).
- Competitors can fork code but CANNOT fork:
  - 12 months of merchant trust data (non-portable reputation)
  - 100,000+ searches of intent viability intelligence (data accumulation takes time)
  - 50+ white-label tenant relationships (network cannot be cloned)

**Recommendation:**
**DO NOT DELAY DATA MOAT ACTIVATION** — Week 1-2 is critical. Once data moat is active, open-source is fine (code without data is useless).

**Approval requirement:**
N/A — Already open-source. No action needed except moat activation.

---

### ❌ 6. Make Intent Hash Public in API Responses

**What it is:**
Including `intent_hash` in search API responses (e.g., `/api/search?category=clothing` returns products with `intent_hash: "a3f5b2..."`).

**Why harmful:**
- **Reverse-engineering risk** — Competitors analyze intent hashes, correlate with conversion patterns, reconstruct intent intelligence.
- **Data scraping** — Competitors systematically call search API, collect intent hashes, build competing intent database.
- **Moat destroyed** — Intent intelligence becomes publicly available (anyone can scrape and replicate).

**Current state:**
Intent hash is internal-only (SHA-256 stored in `search_events` table). NOT exposed in API.

**Keep this way:**
- Intent hash MUST remain backend-only.
- Use internally for ranking, analytics, intent intelligence.
- NEVER expose in API responses (even hashed).

**Alternative approach:**
If intent tracking needed client-side, generate ephemeral session-specific token (not reusable across searches).

**Approval requirement:**
If API design ever exposes intent hash, require CTO approval + data security review.

---

### ❌ 7. Provide Tenant-to-Tenant Merchant Portability

**What it is:**
Feature allowing merchants to freely switch between white-label tenants (e.g., "Move from Tenant A to Tenant B with one click").

**Why harmful:**
- **Tenant network loses value** — If merchants switch freely, tenants have no lock-in (no incentive to bring high-quality merchants).
- **Tenant investment destroyed** — Tenant invests in merchant relationships, branding, support → Merchant leaves instantly → Investment wasted.
- **Adverse selection** — Bad merchants hop between tenants to evade consequences (suspended on Tenant A → move to Tenant B → suspended again → move to Tenant C...).

**Current state:**
Merchant belongs to ONE tenant (foreign key: `merchants.tenant_id`). No switching mechanism exists.

**Keep this way:**
- Merchant can only belong to ONE tenant at a time.
- Tenant can "release" merchant (manual admin action), but merchant must re-verify with new tenant.
- No self-service tenant switching.

**Alternative approach:**
If legitimate use case (merchant genuinely needs to switch tenants):
- Manual admin-mediated process (not self-service)
- Merchant trust score RESETS on tenant switch (discourage frivolous switches)
- New tenant reviews merchant before accepting (quality control)

**Approval requirement:**
If tenant switching ever proposed, require product + CEO approval + tenant impact analysis.

---

## Category 3: Features That Would Attract Wrong Merchants

### ❌ 8. Free-Forever Freemium (No Conversion Path)

**What it is:**
"Freemium" billing mode with no limitations and no path to paid plans. Merchants can use platform indefinitely for free.

**Why harmful:**
- **Attracts merchants who never intend to pay** — Platform optimizes for quantity (many free users) over quality (paying customers).
- **Resource drain** — Free merchants consume indexing, search, storage with zero revenue contribution.
- **Adverse selection** — Bad merchants who cannot succeed anywhere else (too low quality to pay for advertising) accumulate on platform.
- **No incentive to perform** — Free merchants have no skin in the game (no economic consequence for poor performance).

**Current state:**
`merchant_billing.billing_mode` includes 'freemium' but no business logic differentiates it from paid modes.

**Alternative approach:**
- **30-day free trial** — All merchants start free, but MUST add payment method before Day 30.
- **Freemium with limits** — Free tier includes 100 products, 1,000 searches/month. Upgrade required for scale.
- **Freemium with conversion requirement** — Free merchants must achieve X orders within Y days or upgrade to paid.

**Never do:**
- Unlimited free usage with no conversion path
- "Free for small merchants" with no size verification (anyone can claim to be small)

**Approval requirement:**
If free-forever plan ever proposed, require CFO + CEO approval + revenue impact model.

---

### ❌ 9. Hide True CPC/Commission Rates Until Later

**What it is:**
Opaque pricing during merchant onboarding. Merchant signs up without knowing CPC rates or commission percentages. Pricing revealed after merchant invests time in setup.

**Why harmful:**
- **Merchants feel deceived** — "Bait and switch" perception damages reputation.
- **High churn** — Merchant discovers pricing post-setup, decides it's too expensive, leaves immediately.
- **Bad reviews** — Merchants complain publicly ("UCPReady hides pricing until you're locked in").
- **Attracts wrong merchants** — Only merchants who don't do due diligence (low quality) proceed without knowing pricing.

**Current state:**
Billing rates configured per merchant (`merchant_billing` table). Onboarding flow unclear (no UI visible in repo).

**Alternative approach:**
- **Transparent pricing from Day 1** — Pricing page visible before signup.
- **Pricing calculator** — Merchant inputs expected volume, sees estimated monthly cost.
- **No surprises** — All fees (plugin subscription, CPC, commission) disclosed upfront.

**Best practice:**
"Show me the money" — If platform is confident in value proposition, pricing should be public and transparent.

**Approval requirement:**
N/A — Transparent pricing is mandatory. No approval needed.

---

### ❌ 10. No Quality Bar for Merchant Verification

**What it is:**
Accepting any merchant who implements UCP protocol, regardless of store quality, product count, checkout reliability, or business legitimacy.

**Why harmful:**
- **Marketplace fills with low-quality stores** — Broken checkouts, misleading product descriptions, poor customer service.
- **AI agents lose trust** — Agent sends user to merchant, checkout fails, user blames agent (and platform).
- **Good merchants leave** — High-quality merchants don't want to be listed alongside scam stores ("guilt by association").
- **Adverse selection** — Only merchants who cannot succeed on Shopify/Amazon (too low quality) join UCPReady.

**Current state:**
Merchant verification checks UCP compliance only (`worker/jobs/verifyMerchantUCP.js`). No quality signals checked.

**Alternative approach:**
- **Minimum product count** — Merchant must have ≥10 products to activate (proves serious business).
- **Working checkout verification** — Platform test-creates checkout session, verifies it returns valid URL.
- **Domain age check** — Reject brand-new domains (scam risk).
- **Manual review for first 100 merchants** — Admin approves each merchant during growth phase.

**Once trust scoring exists (Gap 2):**
Low-quality merchants automatically suppressed by trust ranking (checkout failures → low trust → low visibility → self-selection out).

**Approval requirement:**
If "accept all merchants" policy ever proposed, require product + CEO approval + consumer trust impact analysis.

---

## Category 4: Features That Would Create Regulatory/Compliance Issues

### ❌ 11. Process End-User Payments Through Directory

**What it is:**
Directory becomes payment processor—users enter credit card on directory checkout page, directory charges user, directory pays merchant (minus fees).

**Why harmful:**
- **PCI-DSS compliance required** — Must store/process credit cards securely (expensive, complex).
- **Payment processor license** — May require money transmitter license (state-by-state in US, country-by-country in EU).
- **Fraud detection infrastructure** — Directory liable for chargebacks, must build fraud detection.
- **Escrow/settlement complexity** — Directory holds funds, must settle with merchants, becomes financial intermediary.
- **Regulatory burden** — FinCEN reporting, AML compliance, tax withholding (1099/VAT).

**Current model (CORRECT):**
- Directory is **discovery + attribution layer** (NOT payment processor)
- User pays merchant DIRECTLY on merchant's WooCommerce site
- Directory receives webhook with order details (for commission calculation)
- Directory bills merchant monthly (B2B invoicing, NOT user payment processing)

**Keep this boundary:**
- Directory NEVER processes end-user credit cards
- Directory NEVER holds end-user payment information
- Directory creates checkout sessions (calls merchant UCP API), redirects user to merchant site
- Merchant processes payment, sends webhook to directory

**Alternative approach (if payment integration needed):**
- **Stripe Connect Express** — Merchant connects their own Stripe account, directory facilitates but doesn't process.
- **PayPal Commerce Platform** — Similar model (merchant owns account, directory facilitates).
- NEVER: Directory-owned merchant of record model (too much compliance burden).

**Approval requirement:**
If end-user payment processing ever proposed, require CFO + CEO + Legal approval + compliance readiness assessment.

**DO NOT BUILD:**
- Stripe Checkout for end users (only for B2B merchant billing)
- Payment intent creation for end-user purchases
- Credit card tokenization/storage for end users
- Marketplace payout models where directory holds funds

**The directory is NOT a payment processor. Maintain this boundary.**

---

### ❌ 12. Store End-User Personal Data (GDPR/Privacy Risk)

**What it is:**
Collecting and storing end-user personal information (names, addresses, emails, purchase history) beyond what's needed for attribution.

**Why harmful:**
- **GDPR compliance burden** — Data controller responsibilities (consent, access requests, deletion, portability).
- **Privacy risk** — Data breaches expose user PII, reputational damage.
- **Liability** — Directory becomes liable for data misuse, regulatory fines.
- **Unnecessary** — Directory only needs attribution data (session IDs, referral IDs), NOT user PII.

**Current model (CORRECT):**
- Directory tracks sessions anonymously (`search_events`, `click_events`, `checkout_sessions`)
- Merchant's webhook includes order details (merchant's order ID, revenue), NOT user PII
- Directory never sees user names, addresses, emails, payment details

**Keep this boundary:**
- Session tracking is anonymous (session IDs are ephemeral, not tied to user identity)
- Order webhooks reference merchant order IDs (directory doesn't store order details)
- No user accounts on directory (users browse anonymously)

**Alternative approach (if user accounts needed for AI agents):**
- OAuth with external providers (Google, GitHub) — User identity managed externally
- Minimal data storage (user ID, preferences), no PII
- GDPR-compliant deletion (automated within 30 days of account closure)

**Approval requirement:**
If end-user PII storage ever proposed, require Legal + Security approval + GDPR compliance plan.

---

## Category 5: Features That Feel Urgent But Aren't

### ❌ 13. Real-Time Product Sync (Sub-Second)

**What it is:**
Webhooks or WebSockets that sync product changes from merchant to directory in real-time (merchant updates price → directory updates instantly).

**Why not urgent:**
- **Current 6-hour indexing cadence is acceptable** for AI commerce (products are not flash sales).
- **Over-optimization** — Engineering effort better spent on moat activation (ranking, trust).
- **Scaling complexity** — Real-time sync requires webhook infrastructure, queue management, race condition handling.

**Current state:**
Product indexing runs every 6 hours (`worker/jobs/indexProducts.js`). Products marked out-of-stock after 7 days without re-index.

**When to build:**
- After moat activation (Week 1-2) is complete
- After merchant complaints about stale pricing
- After competitive pressure (competitor has real-time sync)

**Priority:**
Low (Tier 4 — opportunistic). Do not delay moat work for this.

---

### ❌ 14. Advanced Analytics Dashboards (Vanity Metrics)

**What it is:**
Beautiful charts and graphs showing merchant metrics that don't drive decisions (e.g., "pageviews over time", "click heatmaps", "geographic distribution").

**Why not urgent:**
- **Data exists** — `merchant_daily_stats` table has click counts, order counts, revenue.
- **Basic display sufficient** — Merchant can see core metrics (clicks, orders, revenue) in simple table.
- **Vanity metrics** — Pretty charts that don't change merchant behavior = wasted engineering effort.

**Current state:**
Admin analytics endpoint exists (`routes/admin.js:232-285`). Returns aggregated data, no fancy UI.

**When to build:**
- After performance-aware ranking (Gap 1) is active
- After trust scoring (Gap 2) is active
- After merchants REQUEST better analytics (pull, not push)

**Alternative:**
- Build merchant ACTIONABLE analytics first:
  - Intent performance (which searches convert)
  - Trust score trend (improving or declining)
  - Benchmarking (your metrics vs category average)
- Actionable analytics > vanity metrics

**Priority:**
Low (Tier 3 — moat deepening). Only build if merchants request and will act on insights.

---

### ❌ 15. Multi-Currency Support (Beyond EUR)

**What it is:**
Supporting USD, GBP, JPY, etc. in addition to EUR. Currency conversion, multi-currency search, currency-specific pricing.

**Why not urgent:**
- **EUR-only is fine for EU market focus** — Most UCPReady merchants likely EU-based (WooCommerce + UCP plugin).
- **Complex edge cases** — Currency conversion rates, search across currencies ("show €30 products in USD"), checkout currency mismatches.
- **Limited merchant demand** — No evidence of merchants requesting multi-currency (no GitHub issues visible).

**Current state:**
Database supports `currency` field (`search_events`, `products` tables). EUR assumed.

**When to build:**
- After geographic expansion strategy defined (e.g., "launch in US market")
- After merchant demand validated (multiple merchants request multi-currency)
- After moat activation (don't delay ranking, trust, intent intelligence for currency support)

**Priority:**
Low (Tier 4 — opportunistic). Geographic expansion is strategic decision, not tactical feature.

---

## Enforcement Guidelines

### How to Use This List

**When feature is requested:**
1. Check if feature is on "Do NOT Build" list
2. If yes, respond: "This feature would weaken our competitive moats. See `docs/gap-analysis/do-not-build-list.md` for rationale."
3. Escalate to product + CEO for approval (even if user insists)

**Approval process for blocked features:**
1. Requestor writes 1-page moat mitigation plan: "How do we build this feature WITHOUT weakening moats?"
2. Product + CTO + CEO review
3. If approved, document moat mitigation strategy BEFORE development starts
4. Re-assess moat strength 90 days after feature launch

**Exceptions:**
- Emergency situations (legal requirement, security vulnerability)
- Explicit CEO override with written justification

---

## Positive Guidance: What TO Build Instead

### Instead of Export Trust Score → Build Trust Score Badges

Merchant can show "5-star on UCPReady" badge on their website (links to UCPReady profile). Keeps score on platform, provides merchant value.

### Instead of Public Intent API → Build Merchant-Specific Intent Reports

Paid feature (€500/month) showing "YOUR products for 'eco t-shirt'" performance. Merchant-specific, not industry-wide.

### Instead of Freshness-Only Ranking → Build Performance-Aware Ranking

`(conversion_rate * trust_score * 0.95) + (freshness_score * 0.05)` — Consequences for merchant behavior, data moat activated.

### Instead of Bypass Trust Score → Build Trust Improvement Pathway

Merchant improves trust by improving performance (checkout quality, fulfillment speed), not by paying.

### Instead of Free-Forever Freemium → Build 30-Day Free Trial

All merchants start free, must add payment method before Day 30. Converts trial users to paying customers.

### Instead of Hidden Pricing → Build Transparent Pricing Page

Public pricing, calculator showing estimated costs, no surprises. Attracts confident merchants.

### Instead of End-User Payment Processing → Build B2B Merchant Billing

Stripe Billing for B2B merchant subscription + usage-based commission. Avoid PCI-DSS, payment licenses, escrow complexity.

### Instead of Real-Time Sync → Build Smart Indexing Priority

High-traffic merchants indexed more frequently. 6-hour cadence acceptable for low-traffic merchants.

### Instead of Vanity Metrics → Build Actionable Analytics

Intent performance, trust score trends, benchmarking. Analytics that change merchant behavior.

### Instead of Multi-Currency Now → Build EUR Perfectly First

Nail EU market, activate moats, THEN expand geographically with multi-currency.

---

## One Non-Obvious "Do NOT Build"

### ❌ Intent Suppression Without Explanation

**What it is:**
Platform detects unviable intent ("eco t-shirt under €15" never converts), returns ZERO results without telling user why.

**Why harmful:**
- **User confusion** — "Why no results? The query is valid."
- **AI agent frustration** — Agent interprets zero results as platform failure, switches to competitor.
- **No learning** — User doesn't understand WHY intent is unviable (could adjust budget if explained).

**Alternative approach:**
- **Intent rerouting with explanation** — "Products under €15 rarely available. Showing €20-30 range instead."
- **Educational messaging** — "Eco-certified t-shirts typically cost €25+. Showing nearest matches."
- **Budget adjustment suggestion** — "Increase budget to €30 to see 12 more results."

**Why this matters:**
Intent intelligence is powerful, but heavy-handed suppression frustrates users. Use intelligence to GUIDE users (education), not BLOCK them (frustration).

**Approval requirement:**
If intent suppression ever implemented, require product approval + user experience testing.

---

## Summary: Three Principles

### 1. Protect Non-Portability

Features that make differentiation portable (export trust score, public intent API) destroy moats. Keep competitive assets locked to platform.

### 2. Avoid Commoditization

Features that turn unique assets into public goods (open-sourcing before data moat active, exposing intent hashes) destroy defensibility.

### 3. Optimize for Quality, Not Quantity

Features that attract wrong merchants (free-forever freemium, no quality bar) create adverse selection. Optimize for merchants who contribute value.

---

## Final Word: "No" is a Feature

**Saying "no" to bad features is as important as saying "yes" to good features.**

This list is a living document. As platform evolves, add new "Do NOT Build" items when:
- Feature request would weaken moat
- Competitor launches feature that looks appealing but is strategically harmful
- Internal team proposes feature without considering defensibility impact

**Review cadence:** Quarterly (or whenever major feature proposed).

**Owner:** Product + CTO (joint ownership).

**Goal:** Ensure platform builds features that STRENGTHEN moats, not WEAKEN them.
