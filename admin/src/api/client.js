import axios from 'axios';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: '/admin',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth and redirect to login
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/admin-ui/login';
    }
    return Promise.reject(error);
  }
);

// Authentication
export const login = async (email, password) => {
  const response = await apiClient.post('/login', { email, password });
  const { token, admin } = response.data;
  localStorage.setItem('admin_token', token);
  localStorage.setItem('admin_user', JSON.stringify(admin));
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  window.location.href = '/admin-ui/login';
};

export const getCurrentUser = () => {
  const userStr = localStorage.getItem('admin_user');
  return userStr ? JSON.parse(userStr) : null;
};

export const isAuthenticated = () => {
  const token = localStorage.getItem('admin_token');
  if (!token) return false;

  try {
    // Check if token is expired (JWT format)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

// Dashboard
export const getDashboardStats = () => {
  return apiClient.get('/dashboard/stats');
};

// Merchants
export const getMerchants = (params) => {
  return apiClient.get('/merchants', { params });
};

export const createMerchant = (data) => {
  return apiClient.post('/merchants', data);
};

export const updateMerchant = (id, data) => {
  return apiClient.patch(`/merchants/${id}`, data);
};

export const deleteMerchant = (id) => {
  return apiClient.delete(`/merchants/${id}`);
};

export const suspendMerchant = (id) => {
  return apiClient.post(`/merchants/${id}/suspend`);
};

export const activateMerchant = (id) => {
  return apiClient.post(`/merchants/${id}/activate`);
};

export const recrawlMerchant = (id) => {
  return apiClient.post(`/merchants/${id}/recrawl`);
};

export const indexMerchant = (id) => {
  return apiClient.post(`/merchants/${id}/index`);
};

export const verifyMerchant = (id) => {
  return apiClient.post(`/merchants/${id}/verify`);
};

export const triggerMerchantIndex = (id) => {
  return apiClient.post(`/merchants/${id}/index`);
};

// Analytics
export const getAnalytics = (params) => {
  return apiClient.get('/analytics', { params });
};

export const exportAnalytics = (params) => {
  return apiClient.get('/analytics/export', {
    params,
    responseType: 'blob'
  });
};

// Billing
export const getBillingInvoices = (params) => {
  return apiClient.get('/invoices', { params });
};

export const getInvoicePdf = (id) => {
  return apiClient.get(`/invoices/${id}/pdf`, {
    responseType: 'blob'
  });
};

export const markInvoicePaid = (id) => {
  return apiClient.post(`/invoices/${id}/mark-paid`);
};

export const sendInvoiceReminder = (id) => {
  return apiClient.post(`/invoices/${id}/send-reminder`);
};

// Tenants
export const getTenants = (params) => {
  return apiClient.get('/tenants', { params });
};

export const createTenant = (data) => {
  return apiClient.post('/tenants', data);
};

export const updateTenant = (id, data) => {
  return apiClient.patch(`/tenants/${id}`, data);
};

export const deleteTenant = (id) => {
  return apiClient.delete(`/tenants/${id}`);
};

// Admin Users
export const getAdminUsers = (params) => {
  return apiClient.get('/admins', { params });
};

export const createAdminUser = (data) => {
  return apiClient.post('/admins', data);
};

export const updateAdminUser = (id, data) => {
  return apiClient.patch(`/admins/${id}`, data);
};

export const deleteAdminUser = (id) => {
  return apiClient.delete(`/admins/${id}`);
};

// Audit Logs
export const getAuditLogs = (params) => {
  return apiClient.get('/audit-logs', { params });
};

// System Health
export const getSystemHealth = () => {
  return apiClient.get('/system/health');
};

// Stats Rollup
export const triggerStatsRollup = () => {
  return apiClient.post('/trigger-rollup');
};

// Categories
export const getCategories = (params) => {
  return apiClient.get('/categories', { params });
};

export const getCategory = (id) => {
  return apiClient.get(`/categories/${id}`);
};

export const createCategory = (data) => {
  return apiClient.post('/categories', data);
};

export const updateCategory = (id, data) => {
  return apiClient.put(`/categories/${id}`, data);
};

export const deleteCategory = (id) => {
  return apiClient.delete(`/categories/${id}`);
};

// Products
export const getProducts = (params) => {
  return apiClient.get('/products', { params });
};

export const getProduct = (id) => {
  return apiClient.get(`/products/${id}`);
};

export const updateProduct = (id, data) => {
  return apiClient.put(`/products/${id}`, data);
};

export const deleteProduct = (id) => {
  return apiClient.delete(`/products/${id}`);
};

// System operations
export const triggerProductIndexing = () => {
  return apiClient.post('/trigger-index');
};

export default apiClient;
