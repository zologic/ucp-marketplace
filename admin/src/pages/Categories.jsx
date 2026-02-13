import React, { useState, useEffect } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory, getTenants } from '../api/client';
import './Categories.css';

function Categories() {
  const [categories, setCategories] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    parent_id: '',
    google_taxonomy_id: '',
    display_order: 0
  });

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchCategories();
    }
  }, [selectedTenant]);

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

  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCategories({ tenant_id: selectedTenant });
      setCategories(response.data.categories || []);
    } catch (err) {
      setError('Failed to load categories');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await createCategory({
        ...formData,
        tenant_id: selectedTenant
      });
      setShowCreateModal(false);
      resetForm();
      fetchCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create category');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      await updateCategory(editingCategory.id, formData);
      setShowEditModal(false);
      setEditingCategory(null);
      resetForm();
      fetchCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update category');
    }
  };

  const handleDelete = async (categoryId, categoryName) => {
    if (!window.confirm(`Are you sure you want to delete "${categoryName}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteCategory(categoryId);
      fetchCategories();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete category');
    }
  };

  const openEditModal = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name || '',
      slug: category.slug || '',
      description: category.description || '',
      parent_id: category.parent_id || '',
      google_taxonomy_id: category.google_taxonomy_id || '',
      display_order: category.display_order || 0
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      parent_id: '',
      google_taxonomy_id: '',
      display_order: 0
    });
  };

  if (loading && categories.length === 0) {
    return <div className="categories-page"><div className="loading">Loading categories...</div></div>;
  }

  return (
    <div className="categories-page">
      <div className="page-header">
        <h1>Categories</h1>
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
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + Add Category
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="categories-stats">
        <div className="stat-card">
          <div className="stat-value">{categories.length}</div>
          <div className="stat-label">Total Categories</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {categories.reduce((sum, cat) => sum + parseInt(cat.product_count || 0), 0)}
          </div>
          <div className="stat-label">Total Products</div>
        </div>
      </div>

      <div className="categories-table-container">
        <table className="categories-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Products</th>
              <th>Merchants</th>
              <th>Google Taxonomy</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">
                  No categories found. Click "Add Category" to create one.
                </td>
              </tr>
            ) : (
              categories.map(category => (
                <tr key={category.id}>
                  <td className="category-name">{category.name}</td>
                  <td className="category-slug">{category.slug}</td>
                  <td>{category.product_count || 0}</td>
                  <td>{category.merchant_count || 0}</td>
                  <td>{category.google_taxonomy_id || '-'}</td>
                  <td>
                    <span className={`status-badge ${category.is_active ? 'active' : 'inactive'}`}>
                      {category.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => openEditModal(category)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => handleDelete(category.id, category.name)}
                      title="Delete"
                      disabled={parseInt(category.product_count) > 0}
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

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Category</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Electronics"
                />
              </div>
              <div className="form-group">
                <label>Slug</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="electronics (auto-generated if empty)"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="3"
                  placeholder="Category description..."
                />
              </div>
              <div className="form-group">
                <label>Google Taxonomy ID</label>
                <input
                  type="text"
                  value={formData.google_taxonomy_id}
                  onChange={(e) => setFormData({ ...formData, google_taxonomy_id: e.target.value })}
                  placeholder="222"
                />
              </div>
              <div className="form-group">
                <label>Display Order</label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingCategory && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Category</h2>
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
                <label>Slug</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label>Google Taxonomy ID</label>
                <input
                  type="text"
                  value={formData.google_taxonomy_id}
                  onChange={(e) => setFormData({ ...formData, google_taxonomy_id: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Display Order</label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                />
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

export default Categories;
