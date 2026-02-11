-- Migration: Create order_reviews table
-- Phase 2B: Order verification and fraud detection

-- Create order_reviews table for flagged orders
CREATE TABLE order_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    revenue_cents INTEGER NOT NULL,
    reason VARCHAR(50) NOT NULL, -- 'high_value' or 'suspicious_low_value'
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    metadata JSONB, -- For storing additional context (e.g., z-score, avg_revenue)
    reviewed_by VARCHAR(255), -- Admin user who reviewed
    reviewed_at TIMESTAMP,
    notes TEXT, -- Admin notes from review
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for admin dashboard queries
CREATE INDEX idx_order_reviews_status ON order_reviews(status);
CREATE INDEX idx_order_reviews_merchant ON order_reviews(merchant_id);
CREATE INDEX idx_order_reviews_created ON order_reviews(created_at DESC);
CREATE INDEX idx_order_reviews_order ON order_reviews(order_id);

-- Comments for documentation
COMMENT ON TABLE order_reviews IS 'Flagged orders requiring manual review for fraud detection';
COMMENT ON COLUMN order_reviews.reason IS 'high_value: order >€100, suspicious_low_value: AOV anomaly (2σ below average)';
COMMENT ON COLUMN order_reviews.metadata IS 'Additional context: z-score, avg_revenue, stddev for statistical analysis';
COMMENT ON COLUMN order_reviews.status IS 'pending: awaiting review, approved: verified legitimate, rejected: fraud confirmed';
