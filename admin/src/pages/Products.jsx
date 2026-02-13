import React, { useState, useEffect } from 'react';
import { getProducts, getProduct, updateProduct, deleteProduct, getTenants, getMerchants, getCategories } from '../api/client';
import './Products.css';

function Products() {
  const [products, setProducts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_cents: 0,
    currency: 'EUR',
    stock_status: 'in_stock',
    category_ids: []
  });

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchMerchants();
      fetchCategories();
      fetchProducts();
    }
  }, [selectedTenant, selectedMerchant, selectedCategory, searchQuery, pagination.page]);

  const fetchTenants = async () => {
    try {
      const response = await getTenants();
      setTenants(response.data.tenants || []);
      if (response.data.tenants && response.data.tenants.length > 0) {
        setSelectedTenant(response.data.tenants[0].id);
      }
    } catch (err) {
      setError('Failed to load tenants');
      console.error(err);
    }
  };

  const fetchMerchants = async () => {
    try {
      const response = await getMerchants();
      const tenantMerchants = (response.data.merchants || []).filter(
        m => m.tenant_id === selectedTenant
      );
      setMerchants(tenantMerchants);
    } catch (err) {
      console.error('Failed to load merchants:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await getCategories({ tenant_id: selectedTenant });
      setCategories(response.data.categories || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        tenant_id: selectedTenant,
        page: pagination.page,
        limit: pagination.limit
      };
      if (selectedMerchant) params.merchant_id = selectedMerchant;
      if (selectedCategory) params.category_id = selectedCategory;
      if (searchQuery) params.search = searchQuery;

      const response = await getProducts(params);
      setProducts(response.data.products || []);
      setPagination(response.data.pagination || pagination);
    } catch (err) {
      setError('Failed to load products');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = async (productId) => {
    try {
      const response = await getProduct(productId);
      const product = response.data.product;
      setEditingProduct(product);
      setFormData({
        name: product.name || '',
        description: product.description || '',
        price_cents: product.price_cents || 0,
        currency: product.currency || 'EUR',
        stock_status: product.stock_status || 'in_stock',
        category_ids: (product.categories || []).map(c => c.id)
      });
      setShowEditModal(true);
    } catch (err) {
      setError('Failed to load product details');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      await updateProduct(editingProduct.id, formData);
      setShowEditModal(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update product');
    }
  };

  const handleDelete = async (productId, productName) => {
    if (!window.confirm(`Are you sure you want to delete "${productName}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteProduct(productId);
      fetchProducts();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete product');
    }
  };

  const resetFilters = () => {
    setSelectedMerchant('');
    setSelectedCategory('');
    setSearchQuery('');
    setPagination({ ...pagination, page: 1 });
  };

  const formatPrice = (cents, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'EUR'
    }).format(cents / 100);
  };

  if (loading && products.length === 0) {
    return <div className="products-page"><div className="loading">Loading products...</div></div>;
  }

  return (
    <div className="products-page">
      <div className="page-header">
        <h1>Products</h1>
        <div className="header-actions">
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="tenant-select"
          >
            {tenants.map(tenant => (
              <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="filters-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <select
          value={selectedMerchant}
          onChange={(e) => setSelectedMerchant(e.target.value)}
          className="filter-select"
        >
          <option value="">All Merchants</option>
          {merchants.map(merchant => (
            <option key={merchant.id} value={merchant.id}>{merchant.domain}</option>
          ))}
        </select>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="filter-select"
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={resetFilters}>
          Reset Filters
        </button>
      </div>

      <div className="products-stats">
        <div className="stat-card">
          <div className="stat-value">{pagination.total || products.length}</div>
          <div className="stat-label">Total Products</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {products.filter(p => p.stock_status === 'in_stock').length}
          </div>
          <div className="stat-label">In Stock</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {products.filter(p => p.has_variations).length}
          </div>
          <div className="stat-label">With Variations</div>
        </div>
      </div>

      <div className="products-table-container">
        <table className="products-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Product</th>
              <th>Price</th>
              <th>Merchant</th>
              <th>Categories</th>
              <th>Stock</th>
              <th>Variations</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-state">
                  No products found. Adjust filters or wait for merchants to be indexed.
                </td>
              </tr>
            ) : (
              products.map(product => (
                <tr key={product.id}>
                  <td>
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="product-thumb" />
                    ) : (
                      <div className="product-thumb-placeholder">📦</div>
                    )}
                  </td>
                  <td className="product-name">{product.name}</td>
                  <td className="product-price">{formatPrice(product.price_cents, product.currency)}</td>
                  <td className="product-merchant">{product.merchant_domain}</td>
                  <td className="product-categories">
                    {product.categories && product.categories.length > 0
                      ? product.categories.join(', ')
                      : '-'}
                  </td>
                  <td>
                    <span className={`stock-badge ${product.stock_status}`}>
                      {product.stock_status === 'in_stock' ? 'In Stock' :
                       product.stock_status === 'out_of_stock' ? 'Out of Stock' : 'Backorder'}
                    </span>
                  </td>
                  <td>
                    {product.has_variations ? '✓' : '-'}
                  </td>
                  <td className="actions">
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => openEditModal(product.id)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => handleDelete(product.id, product.name)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
            disabled={pagination.page === 1}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {pagination.page} of {pagination.pages} ({pagination.total} products)
          </span>
          <button
            onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
            disabled={pagination.page >= pagination.pages}
            className="btn btn-secondary"
          >
            Next
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingProduct && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Product</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="4"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Price (cents) *</label>
                  <input
                    type="number"
                    value={formData.price_cents}
                    onChange={(e) => setFormData({ ...formData, price_cents: parseInt(e.target.value) })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Stock Status</label>
                <select
                  value={formData.stock_status}
                  onChange={(e) => setFormData({ ...formData, stock_status: e.target.value })}
                >
                  <option value="in_stock">In Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                  <option value="backorder">Backorder</option>
                </select>
              </div>
              <div className="form-group">
                <label>Categories</label>
                <div className="checkbox-group">
                  {categories.map(category => (
                    <label key={category.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.category_ids.includes(category.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              category_ids: [...formData.category_ids, category.id]
                            });
                          } else {
                            setFormData({
                              ...formData,
                              category_ids: formData.category_ids.filter(id => id !== category.id)
                            });
                          }
                        }}
                      />
                      {category.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;
