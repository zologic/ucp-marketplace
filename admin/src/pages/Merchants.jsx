import React, { useState, useEffect } from 'react';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import Modal from '../components/Modal.jsx';
import Table from '../components/Table.jsx';
import {
  getMerchants,
  createMerchant,
  updateMerchant,
  deleteMerchant,
  suspendMerchant,
  activateMerchant,
  recrawlMerchant,
  verifyMerchant,
  triggerMerchantIndex
} from '../api/client.js';

function Merchants() {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    domain: '',
    name: ''
  });
  const [ucpVerifying, setUcpVerifying] = useState(false);
  const [ucpStatus, setUcpStatus] = useState(null); // 'success', 'error', null
  const [ucpError, setUcpError] = useState('');

  const fetchMerchants = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        billing_status: billingFilter !== 'all' ? billingFilter : undefined,
        search: searchQuery || undefined
      };
      const response = await getMerchants(params);
      setMerchants(response.data.merchants || []);
      setTotalPages(response.data.total_pages || 1);
      setError(null);
    } catch (err) {
      setError('Failed to load merchants');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMerchants();
  }, [page, statusFilter, billingFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchMerchants();
  };

  const handleVerifyUcp = async () => {
    if (!formData.domain) {
      setUcpError('Domain is required');
      return;
    }

    setUcpVerifying(true);
    setUcpStatus(null);
    setUcpError('');

    try {
      // Call create merchant API which verifies UCP
      const response = await createMerchant({ domain: formData.domain });

      // Check verification result
      if (response.data.verification?.status === 'verified' || response.data.merchant?.status === 'verified') {
        setUcpStatus('success');
        setUcpError('');

        // Update form with business_name from verification
        const merchantData = response.data.merchant;
        if (merchantData?.business_name) {
          setFormData(prev => ({ ...prev, name: merchantData.business_name }));
        }

        // Close modal and refresh list since merchant was created and verified
        setIsAddModalOpen(false);
        resetForm();
        fetchMerchants();
      } else {
        // Verification failed
        setUcpStatus('error');
        const errorMsg = response.data.verification?.error || 'UCP verification failed';
        setUcpError(errorMsg);
      }
    } catch (err) {
      setUcpStatus('error');
      const errorMsg = err.response?.data?.error || 'UCP verification failed. Please check the domain and try again.';
      setUcpError(errorMsg);
    } finally {
      setUcpVerifying(false);
    }
  };

  const handleCreateMerchant = async () => {
    if (ucpStatus !== 'success') {
      setUcpError('Please verify UCP first');
      return;
    }

    try {
      await createMerchant(formData);
      setIsAddModalOpen(false);
      resetForm();
      fetchMerchants();
    } catch (err) {
      setUcpError(err.response?.data?.message || 'Failed to create merchant');
    }
  };

  const handleUpdateMerchant = async () => {
    try {
      await updateMerchant(selectedMerchant.id, formData);
      setIsEditModalOpen(false);
      resetForm();
      fetchMerchants();
    } catch (err) {
      setError('Failed to update merchant');
    }
  };

  const handleDeleteMerchant = async () => {
    try {
      await deleteMerchant(selectedMerchant.id);
      setIsDeleteModalOpen(false);
      setSelectedMerchant(null);
      fetchMerchants();
    } catch (err) {
      setError('Failed to delete merchant');
    }
  };

  const handleApproveMerchant = async (merchant) => {
    try {
      await activateMerchant(merchant.id);
      fetchMerchants();
    } catch (err) {
      setError('Failed to approve merchant');
    }
  };

  const handleSuspendMerchant = async (merchant) => {
    try {
      await suspendMerchant(merchant.id);
      fetchMerchants();
    } catch (err) {
      setError('Failed to suspend merchant');
    }
  };

  const handleReactivateMerchant = async (merchant) => {
    try {
      await activateMerchant(merchant.id);
      fetchMerchants();
    } catch (err) {
      setError('Failed to reactivate merchant');
    }
  };

  const handleRecrawl = async (merchant) => {
    try {
      const response = await recrawlMerchant(merchant.id);
      const summary = response.data.summary;
      alert(`Product recrawl complete!\n\nInserted: ${summary.inserted}\nUpdated: ${summary.updated}\nErrors: ${summary.errors}\nTotal: ${summary.total}`);
      fetchMerchants(); // Refresh to show updated product count
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to initiate recrawl';
      setError(errorMsg);
      alert(`Recrawl failed: ${errorMsg}`);
    }
  };

  const handleIndexProducts = async (merchant) => {
    try {
      const response = await triggerMerchantIndex(merchant.id);
      alert(`Product indexing started for ${merchant.domain}!\n\nThis will run in the background and may take a few minutes.`);
      fetchMerchants(); // Refresh to show status
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to trigger indexing';
      setError(errorMsg);
      alert(`Indexing failed: ${errorMsg}`);
    }
  };

  const handleReverifyMerchant = async (merchant) => {
    try {
      const response = await verifyMerchant(merchant.id);
      if (response.data.status === 'verified') {
        alert('Merchant verified successfully!');
      } else {
        alert(`Verification failed: ${response.data.error || 'Unknown error'}`);
      }
      fetchMerchants();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to verify merchant');
    }
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const openEditModal = (merchant) => {
    setSelectedMerchant(merchant);
    setFormData({
      domain: merchant.domain,
      name: merchant.name || ''
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (merchant) => {
    setSelectedMerchant(merchant);
    setIsDeleteModalOpen(true);
  };

  const resetForm = () => {
    setFormData({ domain: '', name: '' });
    setUcpStatus(null);
    setUcpError('');
    setSelectedMerchant(null);
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'badge-warning',
      active: 'badge-success',
      suspended: 'badge-danger'
    };
    return `badge ${badges[status] || 'badge-secondary'}`;
  };

  const getBillingBadge = (status) => {
    const badges = {
      paid: 'badge-success',
      unpaid: 'badge-warning',
      overdue: 'badge-danger'
    };
    return `badge ${badges[status] || 'badge-secondary'}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const columns = [
    {
      key: 'domain',
      label: 'Domain',
      sortable: true,
      render: (row) => <span className="font-semibold">{row.domain}</span>
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <span className={getStatusBadge(row.status)}>{row.status}</span>
    },
    {
      key: 'billing_status',
      label: 'Billing Status',
      sortable: true,
      render: (row) => <span className={getBillingBadge(row.billing_status)}>{row.billing_status || 'paid'}</span>
    },
    {
      key: 'products_count',
      label: 'Products',
      sortable: true,
      render: (row) => row.products_count || 0
    },
    {
      key: 'ucp_endpoint',
      label: 'UCP Endpoint',
      render: (row) => (
        <span className="text-muted" style={{ fontSize: '12px' }}>
          {row.ucp_endpoint || 'N/A'}
        </span>
      )
    },
    {
      key: 'last_crawled',
      label: 'Last Crawled',
      sortable: true,
      render: (row) => <span className="text-secondary">{formatDate(row.last_crawled)}</span>
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (row) => <span className="text-secondary">{formatDate(row.created_at)}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="table-actions">
          {row.status === 'pending' && (
            <>
              <Button variant="success" size="sm" onClick={() => handleApproveMerchant(row)}>
                Approve
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleReverifyMerchant(row)}>
                Re-verify
              </Button>
              <Button variant="danger" size="sm" onClick={() => openDeleteModal(row)}>
                Delete
              </Button>
            </>
          )}
          {row.status === 'verified' && (
            <>
              <Button variant="success" size="sm" onClick={() => handleApproveMerchant(row)}>
                Activate
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleReverifyMerchant(row)}>
                Re-verify
              </Button>
            </>
          )}
          {row.status === 'active' && (
            <>
              <Button variant="danger" size="sm" onClick={() => handleSuspendMerchant(row)}>
                Suspend
              </Button>
              <Button variant="outline" size="sm" onClick={() => openEditModal(row)}>
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleRecrawl(row)}>
                Re-crawl
              </Button>
              <Button variant="primary" size="sm" onClick={() => handleIndexProducts(row)}>
                Index Products
              </Button>
            </>
          )}
          {row.status === 'suspended' && (
            <>
              <Button variant="success" size="sm" onClick={() => handleReactivateMerchant(row)}>
                Reactivate
              </Button>
              <Button variant="danger" size="sm" onClick={() => openDeleteModal(row)}>
                Delete
              </Button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">
            <i className="fas fa-shop"></i>
            Merchants
          </h1>
          <p className="page-description">Manage merchant registrations and UCP verification</p>
        </div>
        <Button variant="primary" onClick={openAddModal}>
          <i className="fas fa-plus"></i>
          Add New Merchant
        </Button>
      </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {/* Filters */}
      <div className="filters-container">
        <form onSubmit={handleSearch} className="filters-row">
          <div className="filter-group">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label">Billing Status</label>
            <select
              className="form-select"
              value={billingFilter}
              onChange={(e) => setBillingFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label">Search Domain</label>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by domain..."
            />
          </div>
          <div className="filter-group flex items-end">
            <Button type="submit" variant="primary">
              <i className="fas fa-magnifying-glass"></i>
              Search
            </Button>
          </div>
        </form>
      </div>

      {/* Merchants Table */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <Table columns={columns} data={merchants} />

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

      {/* Add Merchant Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Merchant"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateMerchant}
              disabled={ucpStatus !== 'success'}
            >
              Add Merchant
            </Button>
          </>
        }
      >
        <Input
          label="Domain"
          value={formData.domain}
          onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
          placeholder="cool-store.com"
          required
          disabled={ucpStatus === 'success'}
        />

        <div className="mb-md">
          <Button
            variant="secondary"
            onClick={handleVerifyUcp}
            disabled={ucpVerifying || ucpStatus === 'success'}
          >
            {ucpVerifying ? 'Verifying...' : ucpStatus === 'success' ? 'Verified' : 'Verify UCP'}
          </Button>
        </div>

        {ucpVerifying && (
          <div className="alert alert-info">
            Verifying UCP manifest...
          </div>
        )}

        {ucpStatus === 'success' && (
          <div className="alert alert-success">
            ✓ UCP verified. Merchant ready for approval.
          </div>
        )}

        {ucpStatus === 'error' && (
          <div className="alert alert-danger">
            ✗ {ucpError}
          </div>
        )}

        {ucpStatus === 'success' && (
          <Input
            label="Merchant Name (Optional)"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Cool Store"
          />
        )}
      </Modal>

      {/* Edit Merchant Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Merchant"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateMerchant}>
              Update
            </Button>
          </>
        }
      >
        <Input
          label="Domain"
          value={formData.domain}
          onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
          disabled
        />
        <Input
          label="Merchant Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Cool Store"
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Delete"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteMerchant}>
              Delete
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete merchant <strong>{selectedMerchant?.domain}</strong>?
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

export default Merchants;
