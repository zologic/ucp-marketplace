-- Migration: Add Stripe integration fields
-- Phase 2A: Enable automated billing with Stripe

-- Add Stripe customer ID to merchants table
ALTER TABLE merchants
  ADD COLUMN stripe_customer_id VARCHAR(255);

-- Add Stripe invoice ID to invoices table
ALTER TABLE invoices
  ADD COLUMN stripe_invoice_id VARCHAR(255);

-- Indexes for Stripe lookup queries
CREATE INDEX idx_merchants_stripe_customer ON merchants(stripe_customer_id);
CREATE INDEX idx_invoices_stripe_invoice ON invoices(stripe_invoice_id);

-- Create merchant_contacts table (if not exists) for billing email/name
CREATE TABLE IF NOT EXISTS merchant_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_contacts_merchant ON merchant_contacts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_contacts_primary ON merchant_contacts(merchant_id, is_primary) WHERE is_primary = true;

-- Comments for documentation
COMMENT ON COLUMN merchants.stripe_customer_id IS 'Stripe Customer ID (cus_xxx) for automated billing';
COMMENT ON COLUMN invoices.stripe_invoice_id IS 'Stripe Invoice ID (in_xxx) for payment tracking';
COMMENT ON TABLE merchant_contacts IS 'Merchant contact information for billing and notifications';
