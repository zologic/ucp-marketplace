-- Create invoice_items table for line items for each invoice
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Comments
COMMENT ON TABLE invoice_items IS 'Line items for each invoice';
COMMENT ON COLUMN invoice_items.description IS 'e.g., "Commission (15 orders)", "CPC (342 clicks)"';
