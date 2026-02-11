-- Migration: Add trust score columns and performance index
-- Phase 1A & 1B: Enable moat-creating performance-aware ranking

-- Add trust score columns to merchants table
ALTER TABLE merchants
  ADD COLUMN trust_score DECIMAL(4, 3) DEFAULT 0.500,
  ADD COLUMN trust_score_updated_at TIMESTAMP;

-- Index for ranking queries (trust score DESC for fast sorting)
CREATE INDEX idx_merchants_trust_score ON merchants(trust_score DESC);

-- Index for merchant_daily_stats performance lookback queries
-- Optimizes 90-day rolling window aggregation in search endpoint
-- Note: No partial index filter (CURRENT_DATE not allowed in index predicate)
CREATE INDEX IF NOT EXISTS idx_merchant_daily_stats_lookback
ON merchant_daily_stats(merchant_id, date DESC);

-- Comments for documentation
COMMENT ON COLUMN merchants.trust_score IS 'Pre-calculated trust score (0.0-1.0) updated daily at 04:00 UTC';
COMMENT ON COLUMN merchants.trust_score_updated_at IS 'Timestamp of last trust score calculation';
COMMENT ON INDEX idx_merchant_daily_stats_lookback IS 'Optimizes 90-day performance lookback for conversion-based ranking';
