export interface Admin {
  id: string;
  email: string;
  role: 'admin' | 'superadmin';
  created_at: string;
}

export interface Tenant {
  id: string;
  domain: string;
  name: string;
  branding?: Record<string, any>;
  status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
  merchant_count?: number;
}

export interface Merchant {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  tenant_domain?: string;
  domain: string;
  ucp_endpoint?: string;
  public_key?: string;
  status: 'pending' | 'verified' | 'active' | 'suspended';
  admin_override?: boolean;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
  billing_status?: string;
  billing_mode?: string;
  cpc_billing_enabled?: boolean;
  cpc_rate?: number;
  cpc_enabled_at?: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  merchant_id: string;
  merchant_domain?: string;
  tenant_name?: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_cents: number;
  currency: string;
  status: 'draft' | 'issued' | 'paid' | 'overdue';
  issued_at?: string;
  paid_at?: string;
  due_at?: string;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  admin_email?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface DashboardStats {
  active_merchants: number;
  total_tenants: number;
  revenue_mtd_cents: number;
  searches_today: number;
  orders_today?: number;
}

export interface MerchantAnalytics {
  period?: {
    start?: string;
    end?: string;
  };
  summary: {
    search_count: number;
    click_count: number;
    checkout_count: number;
    order_count: number;
    revenue_cents: number;
    conversion_rate: number;
  };
}

export interface SystemHealth {
  services: {
    database: {
      status: string;
      connections?: number;
    };
    redis: {
      status: string;
      memory_used_bytes?: number;
    };
    mcp_server: {
      status: string;
      last_reload?: string;
    };
    worker: {
      status: string;
    };
  };
  metrics: {
    total_merchants: number;
    total_tenants: number;
    total_products: number;
    db_size_bytes: number;
  };
}

export interface CPCPreview {
  merchant: {
    id: string;
    domain: string;
    cpc_currently_enabled: boolean;
    current_rate: number;
  };
  preview: {
    rate_cents: number;
    period_days: number;
    period_start: string;
    period_end: string;
  };
  summary: {
    total_clicks: number;
    active_days: number;
    unique_queries: number;
    avg_clicks_per_day: number;
    estimated_total_cost_cents: number;
    estimated_total_cost_formatted: string;
    conversion_rate: number;
    total_orders: number;
  };
  top_queries: Array<{
    query: string;
    clicks: number;
    estimated_cost_cents: number;
    estimated_cost_formatted: string;
  }>;
  recommendation: {
    status: string;
    message: string;
  };
}
