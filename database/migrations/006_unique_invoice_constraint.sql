-- ============================================================================
-- Migration 006: Add Unique Constraint to Invoices
-- ============================================================================
-- Purpose: Prevent duplicate invoice generation for same merchant and period
-- Date: 2026-02-13
-- Resolves: BUG-004 from system audit
-- ============================================================================

-- Add unique constraint to prevent duplicate invoices
-- This ensures that only one invoice can exist for a given merchant and billing period
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_merchant_period'
    ) THEN
        ALTER TABLE invoices
        ADD CONSTRAINT unique_merchant_period
        UNIQUE (merchant_id, period_start, period_end);
    END IF;
END $$;

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT unique_merchant_period ON invoices IS
'Prevents duplicate invoices for the same merchant and billing period. Critical for preventing revenue loss from concurrent worker execution.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- This migration adds database-level protection against duplicate invoice
-- generation that could occur when multiple worker instances run simultaneously.
-- ============================================================================
