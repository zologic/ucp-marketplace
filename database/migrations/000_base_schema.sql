-- ============================================================================
-- UCP Marketplace - Base Schema Migration
-- ============================================================================
-- Purpose: Complete base schema for fresh installations
-- Replaces: 26 archived migrations + schema.sql
-- Includes: migrations 001-005 consolidated into base
-- Version: 1.0.0
-- Created: 2026-02-13
-- ============================================================================
-- This file should NEVER be edited after initial deployment.
-- All future changes must go in new numbered migrations (006+).
-- ============================================================================

-- ============================================================================
-- SECTION 1: Custom Types
-- ============================================================================

-- UCP signing status for product verification
CREATE TYPE ucp_signing_status AS ENUM ('pending', 'verified', 'failed');

-- ============================================================================
-- SECTION 2: Core Tables (in dependency order)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tenants: White-label deployment configurations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    branding JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenants IS 'White-label deployment configurations';
COMMENT ON COLUMN tenants.domain IS 'Tenant domain (e.g., shop.ai, partner.nl)';
COMMENT ON COLUMN tenants.branding IS 'JSON object containing logo, colors, etc.';

-- ----------------------------------------------------------------------------
-- Merchants: UCP-compliant merchant stores with enhanced profile data
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchants (
    -- Base fields
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    ucp_endpoint TEXT,
    public_key TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    last_verified_at TIMESTAMP,
    admin_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Onboarding fields
    contact_email VARCHAR(255),
    detection_data JSONB,
    first_seen_at TIMESTAMP,
    last_detection_at TIMESTAMP,

    -- Trust scoring
    trust_score DECIMAL(4, 3) DEFAULT 0.500,
    trust_score_updated_at TIMESTAMP,

    -- CPC billing controls
    cpc_billing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    cpc_enabled_at TIMESTAMP NULL,
    cpc_rate NUMERIC(10,2) NULL,

    -- Stripe integration
    stripe_customer_id VARCHAR(255),

    -- UCP Business Profile Fields (from migration 001)
    business_name VARCHAR(255),
    business_description TEXT,
    business_url VARCHAR(500),

    -- UCP Service Discovery (from migration 001)
    service_base_url VARCHAR(500),
    signing_key_id VARCHAR(100),

    -- Manifest Caching (from migration 001)
    ucp_manifest JSONB,
    manifest_hash VARCHAR(64),
    manifest_version VARCHAR(50),

    -- Indexing Control
    crawl_interval_hours INTEGER DEFAULT 24,
    last_indexed_at TIMESTAMP,

    -- Status constraint with all onboarding states
    CONSTRAINT merchants_status_check CHECK (status IN (
        'pending', 'verified', 'active', 'suspended',
        'pending_plugin', 'pending_activation', 'pending_verification', 'unsupported'
    ))
);

COMMENT ON TABLE merchants IS 'UCP-compliant merchant stores with business profile data';
COMMENT ON COLUMN merchants.status IS 'pending=added, verified=UCP valid, active=searchable, suspended=disabled, pending_*=onboarding states';
COMMENT ON COLUMN merchants.admin_override IS 'Bypass payment checks when TRUE';
COMMENT ON COLUMN merchants.trust_score IS 'Pre-calculated trust score (0.0-1.0) updated daily at 04:00 UTC';
COMMENT ON COLUMN merchants.business_name IS 'Extracted from UCP manifest business_profile.name';
COMMENT ON COLUMN merchants.business_description IS 'Extracted from UCP manifest business_profile.description';
COMMENT ON COLUMN merchants.business_url IS 'Extracted from UCP manifest business_profile.website';
COMMENT ON COLUMN merchants.service_base_url IS 'Extracted from UCP manifest services.base_url for dynamic endpoint construction';
COMMENT ON COLUMN merchants.signing_key_id IS 'Extracted from UCP manifest for Ed25519 signature verification';
COMMENT ON COLUMN merchants.ucp_manifest IS 'Full cached UCP manifest as JSONB';
COMMENT ON COLUMN merchants.manifest_hash IS 'SHA-256 hash for version-based caching';
COMMENT ON COLUMN merchants.crawl_interval_hours IS 'Configurable crawl frequency (default 24 hours)';
COMMENT ON COLUMN merchants.last_indexed_at IS 'Last successful product sync timestamp';

-- ----------------------------------------------------------------------------
-- Merchant Billing: Payment and billing configuration per merchant
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_billing (
    merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    billing_mode VARCHAR(20) NOT NULL DEFAULT 'commission' CHECK (billing_mode IN ('commission', 'cpc', 'freemium')),
    commission_percent INTEGER CHECK (commission_percent >= 0 AND commission_percent <= 100),
    cpc_cents INTEGER CHECK (cpc_cents >= 0),
    plugin_fee_cents INTEGER DEFAULT 0 CHECK (plugin_fee_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'overdue', 'suspended')),
    grace_period_days INTEGER NOT NULL DEFAULT 7 CHECK (grace_period_days >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merchant_billing IS 'Merchant payment and billing configuration';

-- ----------------------------------------------------------------------------
-- Merchant Contacts: Contact information for merchant representatives
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE merchant_contacts IS 'Contact information for merchant representatives';

-- ----------------------------------------------------------------------------
-- Categories: Normalized category taxonomy (from migration 005)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    google_taxonomy_id VARCHAR(50),
    google_taxonomy_path TEXT,
    description TEXT,
    image_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

COMMENT ON TABLE categories IS 'Normalized category taxonomy across all merchants';
COMMENT ON COLUMN categories.slug IS 'URL-safe identifier, unique per tenant';
COMMENT ON COLUMN categories.parent_id IS 'Parent category for hierarchical structure';
COMMENT ON COLUMN categories.google_taxonomy_id IS 'Google Product Taxonomy ID for SEO';

-- ----------------------------------------------------------------------------
-- Merchant Categories: Merchant-specific categories (from migration 005)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    parent_external_id VARCHAR(255),
    google_taxonomy_id VARCHAR(50),
    google_taxonomy_path TEXT,
    description TEXT,
    image_url TEXT,
    product_count INTEGER DEFAULT 0,
    last_synced_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(merchant_id, slug)
);

COMMENT ON TABLE merchant_categories IS 'Categories as defined by each merchant, before normalization';
COMMENT ON COLUMN merchant_categories.external_id IS 'Category ID from merchant WooCommerce/UCP system';

-- ----------------------------------------------------------------------------
-- Products: Indexed product catalog with signing verification status
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL,
    category TEXT,
    brand TEXT,
    image_url TEXT,
    stock_status VARCHAR(20) DEFAULT 'in_stock' CHECK (stock_status IN ('in_stock', 'out_of_stock', 'backorder')),
    signing_status ucp_signing_status DEFAULT 'pending',
    indexed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    -- From migration 002: Product variations
    description_short TEXT,
    description_long TEXT,
    variations JSONB DEFAULT '[]'::jsonb,
    has_variations BOOLEAN DEFAULT false
);

COMMENT ON TABLE products IS 'Indexed product catalog from all merchants';
COMMENT ON COLUMN products.external_id IS 'Merchant product ID';
COMMENT ON COLUMN products.price_cents IS 'Price in minor units (cents)';
COMMENT ON COLUMN products.signing_status IS 'UCP signature verification status: pending (awaiting verification), verified (authentic), failed (tampered or invalid)';
COMMENT ON COLUMN products.description_short IS 'Brief description for product cards (max 150 chars recommended)';
COMMENT ON COLUMN products.description_long IS 'Full product description for detail pages';
COMMENT ON COLUMN products.variations IS 'JSONB array of product variations (size, color, etc.)';
COMMENT ON COLUMN products.has_variations IS 'Quick check flag: true if variations array has items';

-- ----------------------------------------------------------------------------
-- Product Categories Junction: Many-to-many (from migration 005)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_categories (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (product_id, category_id)
);

COMMENT ON TABLE product_categories IS 'Many-to-many relationship between products and categories';

-- ----------------------------------------------------------------------------
-- Merchant Index Log: Track merchant crawling attempts and results
-- ----------------------------------------------------------------------------
CREATE TABLE merchant_index_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'partial', 'in_progress')),
  products_indexed INTEGER DEFAULT 0,
  products_failed INTEGER DEFAULT 0,
  error_message TEXT,
  error_code VARCHAR(50),
  manifest_hash VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merchant_index_log IS 'Track every merchant crawl attempt with status and errors';

-- ============================================================================
-- SECTION 3: Event Tracking Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    intent_hash TEXT NOT NULL,
    category TEXT,
    brand TEXT,
    max_price_cents INTEGER,
    currency VARCHAR(3),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE search_events IS 'GDPR-safe search intent tracking (hashed user intent)';

CREATE TABLE IF NOT EXISTS click_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    intent_hash TEXT,
    session_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE click_events IS 'Product click tracking for CPC billing';

CREATE TABLE IF NOT EXISTS checkout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    referral_id TEXT UNIQUE NOT NULL,
    session_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'completed', 'abandoned')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    -- From migration 004: referral source tracking
    referral_source VARCHAR(255)
);

COMMENT ON TABLE checkout_sessions IS 'Tracked checkout attempts';
COMMENT ON COLUMN checkout_sessions.referral_source IS 'Source of the referral (e.g., "UCP-{tenant_id}")';

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    checkout_session_id UUID REFERENCES checkout_sessions(id) ON DELETE SET NULL,
    referral_id TEXT UNIQUE NOT NULL,
    merchant_order_id TEXT NOT NULL,
    revenue_cents INTEGER NOT NULL CHECK (revenue_cents >= 0),
    currency VARCHAR(3) NOT NULL,
    webhook_signature TEXT,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    -- From migration 004: referral source tracking
    referral_source VARCHAR(255)
);

COMMENT ON TABLE orders IS 'Verified order records from merchant webhooks';
COMMENT ON COLUMN orders.referral_source IS 'Source of the referral for attribution tracking';

CREATE TABLE order_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    revenue_cents INTEGER NOT NULL,
    reason VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    metadata JSONB,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE order_reviews IS 'Manual order verification for trust scoring';

-- ============================================================================
-- SECTION 4: Billing & Finance Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS billable_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('click', 'order')),
    reference_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
    invoiced BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE billable_events IS 'Billable events (CPC clicks and commission orders)';

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    invoice_number TEXT UNIQUE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'overdue')),
    issued_at TIMESTAMP,
    paid_at TIMESTAMP,
    due_at TIMESTAMP,
    stripe_invoice_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE invoices IS 'Merchant invoices';

CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE invoice_items IS 'Invoice line items';

-- ============================================================================
-- SECTION 5: Revenue Sharing Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_revenue (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    revenue_share_percent INTEGER NOT NULL DEFAULT 0 CHECK (revenue_share_percent >= 0 AND revenue_share_percent <= 100),
    applies_to VARCHAR(20) NOT NULL DEFAULT 'both' CHECK (applies_to IN ('commission', 'cpc', 'both')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenant_revenue IS 'Revenue sharing configuration for white-label tenants';

CREATE TABLE IF NOT EXISTS revenue_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billable_event_id UUID NOT NULL REFERENCES billable_events(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    tenant_cents INTEGER NOT NULL CHECK (tenant_cents >= 0),
    platform_cents INTEGER NOT NULL CHECK (platform_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE revenue_splits IS 'Calculated revenue splits between tenant and platform';

CREATE TABLE IF NOT EXISTS tenant_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    statement_number TEXT UNIQUE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_earned_cents INTEGER NOT NULL CHECK (total_earned_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid')),
    issued_at TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenant_statements IS 'Periodic revenue statements for tenants';

-- ============================================================================
-- SECTION 6: Analytics & Stats Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    search_count INTEGER NOT NULL DEFAULT 0 CHECK (search_count >= 0),
    click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
    checkout_count INTEGER NOT NULL DEFAULT 0 CHECK (checkout_count >= 0),
    order_count INTEGER NOT NULL DEFAULT 0 CHECK (order_count >= 0),
    revenue_cents INTEGER NOT NULL DEFAULT 0 CHECK (revenue_cents >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merchant_daily_stats IS 'Daily performance metrics for merchant ranking';

-- ============================================================================
-- SECTION 7: Admin & Audit Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admins IS 'Admin user accounts';

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'System audit trail for admin actions';

-- ============================================================================
-- SECTION 8: Mobile & Future Features
-- ============================================================================

-- From migration 003: Push tokens for mobile notifications
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_identifier VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    token TEXT NOT NULL,
    device_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    active BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE push_tokens IS 'Store push notification tokens for mobile apps (future use)';

-- ============================================================================
-- SECTION 9: Utility Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE system_meta IS 'System-wide key-value metadata store';

-- ============================================================================
-- SECTION 10: Indexes (Performance Optimization)
-- ============================================================================

-- Tenants indexes
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Merchants indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_tenant_domain ON merchants(tenant_id, domain);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_tenant_status ON merchants(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_merchants_onboarding_status ON merchants(tenant_id, status)
    WHERE status IN ('pending_plugin', 'pending_activation', 'pending_verification', 'unsupported');
CREATE INDEX IF NOT EXISTS idx_merchants_cpc_enabled ON merchants(tenant_id, cpc_billing_enabled)
    WHERE cpc_billing_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_merchants_trust_score ON merchants(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_merchants_stripe_customer ON merchants(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_merchants_manifest_hash ON merchants(manifest_hash);
CREATE INDEX IF NOT EXISTS idx_merchants_last_indexed ON merchants(last_indexed_at);
CREATE INDEX IF NOT EXISTS idx_merchants_ucp_manifest ON merchants USING GIN (ucp_manifest);

-- Merchant Billing indexes
CREATE INDEX IF NOT EXISTS idx_merchant_billing_status ON merchant_billing(status);

-- Merchant Contacts indexes
CREATE INDEX IF NOT EXISTS idx_merchant_contacts_merchant ON merchant_contacts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_contacts_primary ON merchant_contacts(merchant_id, is_primary) WHERE is_primary = true;

-- Categories indexes (from migration 005)
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(tenant_id, slug);

-- Merchant Categories indexes (from migration 005)
CREATE INDEX IF NOT EXISTS idx_merchant_categories_merchant ON merchant_categories(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_categories_external ON merchant_categories(merchant_id, external_id);

-- Products indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_merchant_external ON products(merchant_id, external_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_merchant ON products(tenant_id, merchant_id);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_signing_status ON products(signing_status);
CREATE INDEX IF NOT EXISTS idx_products_verified ON products(merchant_id, signing_status)
  WHERE signing_status = 'verified';
CREATE INDEX IF NOT EXISTS idx_products_has_variations ON products(has_variations) WHERE has_variations = true;
CREATE INDEX IF NOT EXISTS idx_products_variations_gin ON products USING gin(variations);

-- Product Categories indexes (from migration 005)
CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);

-- Merchant Index Log indexes
CREATE INDEX IF NOT EXISTS idx_merchant_index_log_merchant_started ON merchant_index_log(merchant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_index_log_status ON merchant_index_log(status);
CREATE INDEX IF NOT EXISTS idx_merchant_index_log_started ON merchant_index_log(started_at DESC);

-- Search Events indexes
CREATE INDEX IF NOT EXISTS idx_search_events_tenant_merchant_created ON search_events(tenant_id, merchant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_search_events_intent_hash ON search_events(intent_hash);
CREATE INDEX IF NOT EXISTS idx_search_events_created ON search_events(created_at);

-- Click Events indexes
CREATE INDEX IF NOT EXISTS idx_click_events_tenant_merchant_created ON click_events(tenant_id, merchant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_click_events_session_product ON click_events(session_id, product_id);
CREATE INDEX IF NOT EXISTS idx_click_events_created ON click_events(created_at);

-- Checkout Sessions indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkout_sessions_referral ON checkout_sessions(referral_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_tenant_merchant_status_created ON checkout_sessions(tenant_id, merchant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_referral_source ON checkout_sessions(referral_source);

-- Orders indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_referral ON orders(referral_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_merchant_created ON orders(tenant_id, merchant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_order ON orders(merchant_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_referral_source ON orders(referral_source);

-- Order Reviews indexes
CREATE INDEX IF NOT EXISTS idx_order_reviews_status ON order_reviews(status);
CREATE INDEX IF NOT EXISTS idx_order_reviews_merchant ON order_reviews(merchant_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_created ON order_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_reviews_order ON order_reviews(order_id);

-- Billable Events indexes
CREATE INDEX IF NOT EXISTS idx_billable_events_merchant_invoiced_occurred ON billable_events(merchant_id, invoiced, occurred_at);
CREATE INDEX IF NOT EXISTS idx_billable_events_reference ON billable_events(reference_id);
CREATE INDEX IF NOT EXISTS idx_billable_events_occurred ON billable_events(occurred_at);

-- Invoices indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_merchant_status ON invoices(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_at ON invoices(due_at);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_invoice ON invoices(stripe_invoice_id);

-- Invoice Items indexes
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Revenue Splits indexes
CREATE INDEX IF NOT EXISTS idx_revenue_splits_tenant_created ON revenue_splits(tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_splits_billable_event ON revenue_splits(billable_event_id);

-- Tenant Statements indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_statements_number ON tenant_statements(statement_number);
CREATE INDEX IF NOT EXISTS idx_tenant_statements_tenant_status ON tenant_statements(tenant_id, status);

-- Merchant Daily Stats indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_daily_stats_merchant_date ON merchant_daily_stats(merchant_id, date);
CREATE INDEX IF NOT EXISTS idx_merchant_daily_stats_tenant_date ON merchant_daily_stats(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_merchant_daily_stats_lookback ON merchant_daily_stats(merchant_id, date DESC);

-- Admins indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

-- Audit Logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_time ON audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_time ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_time ON audit_logs(action, created_at DESC);

-- Push Tokens indexes (from migration 003)
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_identifier ON push_tokens(user_identifier);
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON push_tokens(platform);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(active);
CREATE INDEX IF NOT EXISTS idx_push_tokens_created_at ON push_tokens(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_token_unique ON push_tokens(token) WHERE active = TRUE;

-- System Meta indexes
CREATE INDEX IF NOT EXISTS idx_system_meta_updated ON system_meta(updated_at DESC);

-- ============================================================================
-- SECTION 11: Generated Columns & Advanced Search (from migration 002)
-- ============================================================================

-- Add generated search vector column with weighted ranking
-- This is done AFTER table creation because ALTER ADD COLUMN works even if column exists
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(brand, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(description_short, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(description_long, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'C')
    ) STORED;

-- Create GIN index on the generated column
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN (search_vector);

COMMENT ON COLUMN products.search_vector IS 'Generated tsvector for weighted full-text search. Weights: A=name/brand (highest), B=category, C=descriptions. Updated automatically on row changes.';

-- ============================================================================
-- SECTION 12: Triggers (Automatic Timestamp Updates)
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables with updated_at column
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchants_updated_at ON merchants;
CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON merchants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_billing_updated_at ON merchant_billing;
CREATE TRIGGER update_merchant_billing_updated_at BEFORE UPDATE ON merchant_billing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_revenue_updated_at ON tenant_revenue;
CREATE TRIGGER update_tenant_revenue_updated_at BEFORE UPDATE ON tenant_revenue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchant_contacts_updated_at ON merchant_contacts;
CREATE TRIGGER update_merchant_contacts_updated_at BEFORE UPDATE ON merchant_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 13: Seed Default Tenant
-- ============================================================================

-- Insert default tenant for fresh installations
INSERT INTO tenants (name, domain, status)
VALUES ('Marketplace', 'localhost', 'active')
ON CONFLICT (domain) DO NOTHING;

-- Insert tenant revenue configuration
INSERT INTO tenant_revenue (tenant_id, revenue_share_percent, applies_to, status)
SELECT id, 80, 'both', 'active'
FROM tenants WHERE domain = 'localhost'
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- Base Schema Complete
-- ============================================================================
-- Total Tables: 25
-- Total Indexes: 85+
-- Total Triggers: 5
-- Custom Types: 1 (ucp_signing_status)
-- Migrations Consolidated: 001-005
-- ============================================================================
