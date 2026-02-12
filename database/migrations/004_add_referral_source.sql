-- Add referral_source to checkout_sessions
ALTER TABLE checkout_sessions
ADD COLUMN IF NOT EXISTS referral_source VARCHAR(255);

COMMENT ON COLUMN checkout_sessions.referral_source IS 'Source of the referral (e.g., "UCP-{tenant_id}" or "UCP-{merchant_id}")';

-- Add referral_source to orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS referral_source VARCHAR(255);

COMMENT ON COLUMN orders.referral_source IS 'Source of the referral for attribution tracking';

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_orders_referral_source ON orders(referral_source);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_referral_source ON checkout_sessions(referral_source);
