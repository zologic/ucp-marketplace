import React, { useState, useEffect } from 'react';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import Modal from '../components/Modal.jsx';
import Table from '../components/Table.jsx';
import {
  getTenants,
  createTenant,
  updateTenant
} from '../api/client.js';

function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    revenue_share: 95,
    status: 'active'
  });
  const [formError, setFormError] = useState('');

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20
      };
      const response = await getTenants(params);
      setTenants(response.data.tenants || []);
      setTotalPages(response.data.total_pages || 1);
      setError(null);
    } catch (err) {
      setError('Failed to load tenants');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [page]);

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    setFormError('');

    // Validation
    if (!formData.name || !formData.domain) {
      setFormError('Name and domain are required');
      return;
    }

    if (formData.revenue_share < 0 || formData.revenue_share > 100) {
      setFormError('Revenue share must be between 0 and 100');
      return;
    }

    try {
      await createTenant(formData);
      setIsAddModalOpen(false);
      resetForm();
      fetchTenants();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create tenant');
    }
  };

  const handleUpdateTenant = async (e) => {
    e.preventDefault();
    setFormError('');

    // Validation
    if (!formData.name || !formData.domain) {
      setFormError('Name and domain are required');
      return;
    }

    if (formData.revenue_share < 0 || formData.revenue_share > 100) {
      setFormError('Revenue share must be between 0 and 100');
      return;
    }

    try {
      await updateTenant(selectedTenant.id, formData);
      setIsEditModalOpen(false);
      resetForm();
      fetchTenants();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to update tenant');
    }
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const openEditModal = (tenant) => {
    setSelectedTenant(tenant);
    setFormData({
      name: tenant.name,
      domain: tenant.domain,
      revenue_share: tenant.revenue_share || 95,
      status: tenant.status
    });
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      domain: '',
      revenue_share: 95,
      status: 'active'
    });
    setFormError('');
    setSelectedTenant(null);
  };

  const getStatusBadge = (status) => {
    return status === 'active' ? 'badge-success' : 'badge-secondary';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (row) => <span className="font-semibold">{row.name}</span>
    },
    {
      key: 'domain',
      label: 'Domain',
      sortable: true,
      render: (row) => (
        <a href={`https://${row.domain}`} target="_blank" rel="noopener noreferrer" className="text-primary">
          {row.domain}
        </a>
      )
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <span className={`badge ${getStatusBadge(row.status)}`}>{row.status}</span>
    },
    {
      key: 'merchants_count',
      label: 'Merchants',
      sortable: true,
      render: (row) => row.merchants_count || 0
    },
    {
      key: 'revenue_share',
      label: 'Revenue Share',
      sortable: true,
      render: (row) => (
        <span className="font-semibold">
          {row.revenue_share || 95}%
          <span className="text-muted" style={{ fontSize: '11px', marginLeft: '4px' }}>
            (Our {100 - (row.revenue_share || 95)}%)
          </span>
        </span>
      )
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (row) => formatDate(row.created_at)
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="table-actions">
          <Button variant="outline" size="sm" onClick={() => openEditModal(row)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => alert('View merchant details')}>
            View Details
          </Button>
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-description">Manage tenant organizations and revenue share agreements</p>
        </div>
        <Button variant="primary" onClick={openAddModal}>
          Add New Tenant
        </Button>
      </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {/* Tenants Table */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <Table columns={columns} data={tenants} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination-btn"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span className="text-secondary">
                Page {page} of {totalPages}
              </span>
              <button
                className="pagination-btn"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Add Tenant Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Tenant"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateTenant}>
              Create Tenant
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateTenant}>
          {formError && (
            <div className="alert alert-danger mb-md">{formError}</div>
          )}

          <Input
            label="Tenant Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Acme Corporation"
            required
          />

          <Input
            label="Domain"
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
            placeholder="acme.com"
            required
          />

          <div className="form-group">
            <label className="form-label">
              Revenue Share (%)
              <span className="text-danger"> *</span>
            </label>
            <input
              type="number"
              className="form-input"
              value={formData.revenue_share}
              onChange={(e) => setFormData({ ...formData, revenue_share: parseInt(e.target.value) })}
              min="0"
              max="100"
              required
            />
            <span className="form-error" style={{ color: 'var(--text-muted)' }}>
              Tenant gets {formData.revenue_share}%, we get {100 - formData.revenue_share}%
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">
              Status
              <span className="text-danger"> *</span>
            </label>
            <select
              className="form-select"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Edit Tenant Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Tenant"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateTenant}>
              Update Tenant
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpdateTenant}>
          {formError && (
            <div className="alert alert-danger mb-md">{formError}</div>
          )}

          <Input
            label="Tenant Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Acme Corporation"
            required
          />

          <Input
            label="Domain"
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
            placeholder="acme.com"
            required
          />

          <div className="form-group">
            <label className="form-label">
              Revenue Share (%)
              <span className="text-danger"> *</span>
            </label>
            <input
              type="number"
              className="form-input"
              value={formData.revenue_share}
              onChange={(e) => setFormData({ ...formData, revenue_share: parseInt(e.target.value) })}
              min="0"
              max="100"
              required
            />
            <span className="form-error" style={{ color: 'var(--text-muted)' }}>
              Tenant gets {formData.revenue_share}%, we get {100 - formData.revenue_share}%
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">
              Status
              <span className="text-danger"> *</span>
            </label>
            <select
              className="form-select"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Tenants;
