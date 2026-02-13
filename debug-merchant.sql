-- Debug merchant status
SELECT
    m.id,
    m.domain,
    m.tenant_id,
    m.status as merchant_status,
    m.admin_override,
    m.service_base_url,
    m.ucp_manifest IS NOT NULL as has_manifest,
    m.last_indexed_at,
    m.crawl_interval_hours,
    mb.status as billing_status,
    mb.billing_mode
FROM merchants m
LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
WHERE m.domain = 'test.zologic.nl';

-- Check products for this merchant
SELECT COUNT(*) as product_count,
       COUNT(CASE WHEN search_vector IS NOT NULL THEN 1 END) as with_search_vector
FROM products p
JOIN merchants m ON p.merchant_id = m.id
WHERE m.domain = 'test.zologic.nl';

-- Check if merchant meets search criteria
SELECT
    m.id,
    m.domain,
    m.status = 'active' as is_active,
    mb.status as billing_status,
    mb.status != 'suspended' as billing_ok,
    m.admin_override,
    (mb.status != 'suspended' OR m.admin_override = true) as can_search
FROM merchants m
LEFT JOIN merchant_billing mb ON m.id = mb.merchant_id
WHERE m.domain = 'test.zologic.nl';
