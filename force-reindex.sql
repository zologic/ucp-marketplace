-- Force re-index by setting last_indexed_at to NULL or old date
UPDATE merchants
SET last_indexed_at = NULL
WHERE domain = 'test.zologic.nl';

-- Verify it was updated
SELECT id, domain, last_indexed_at, crawl_interval_hours
FROM merchants
WHERE domain = 'test.zologic.nl';
