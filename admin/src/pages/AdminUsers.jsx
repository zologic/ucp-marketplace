import React, { useState, useEffect } from 'react';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import Modal from '../components/Modal.jsx';
import Table from '../components/Table.jsx';
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser
} from '../api/client.js';

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'admin',
    status: 'active'
  });
  const [formError, setFormError] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20
      };
      const response = await getAdminUsers(params);
      setUsers(response.data.users || []);
      setTotalPages(response.data.total_pages || 1);
      setError(null);
    } catch (err) {
      setError('Failed to load admin users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError('');

    // Validation
    if (!formData.email || !formData.password) {
      setFormError('Email and password are required');
      return;
    }

    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    try {
      await createAdminUser(formData);
      setIsAddModalOpen(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create admin user');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setFormError('');

    // Validation
    if (!formData.email) {
      setFormError('Email is required');
      return;
    }

    try {
      const updateData = {
        email: formData.email,
        role: formData.role,
        status: formData.status
      };
      await updateAdminUser(selectedUser.id, updateData);
      setIsEditModalOpen(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to update admin user');
    }
  };

  const handleDeleteUser = async () => {
    try {
      await deleteAdminUser(selectedUser.id);
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      setError('Failed to delete admin user');
    }
  };

  const handleDeactivateUser = async (user) => {
    try {
      await updateAdminUser(user.id, { status: 'inactive' });
      fetchUsers();
    } catch (err) {
      setError('Failed to deactivate user');
    }
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      password: '', // Don't show password
      role: user.role,
      status: user.status
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (user) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      role: 'admin',
      status: 'active'
    });
    setFormError('');
    setSelectedUser(null);
  };

  const getStatusBadge = (status) => {
    return status === 'active' ? 'badge-success' : 'badge-secondary';
  };

  const getRoleBadge = (role) => {
    return role === 'super_admin' ? 'badge-primary' : 'badge-secondary';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const columns = [
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      render: (row) => <span className="font-semibold">{row.email}</span>
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (row) => <span className={`badge ${getRoleBadge(row.role)}`}>{row.role}</span>
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <span className={`badge ${getStatusBadge(row.status)}`}>{row.status}</span>
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (row) => <span className="text-secondary">{formatDate(row.created_at)}</span>
    },
    {
      key: 'last_login',
      label: 'Last Login',
      sortable: true,
      render: (row) => <span className="text-secondary">{formatDate(row.last_login)}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="table-actions">
          <Button variant="outline" size="sm" onClick={() => openEditModal(row)}>
            Edit
          </Button>
          {row.status === 'active' && (
            <Button variant="danger" size="sm" onClick={() => handleDeactivateUser(row)}>
              Deactivate
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={() => openDeleteModal(row)}>
            Delete
          </Button>
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Admin Users</h1>
          <p className="page-description">Manage admin user accounts and permissions</p>
        </div>
        <Button variant="primary" onClick={openAddModal}>
          Add New Admin
        </Button>
      </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <Table columns={columns} data={users} />

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

      {/* Add User Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Admin User"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateUser}>
              Create User
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser}>
          {formError && (
            <div className="alert alert-danger mb-md">{formError}</div>
          )}

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="admin@example.com"
            required
          />

          <Input
            label="Password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Minimum 8 characters"
            required
          />

          <div className="form-group">
            <label className="form-label">
              Role
              <span className="text-danger"> *</span>
            </label>
            <select
              className="form-select"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <span className="form-error" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              Super admins have full access including user management
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

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Admin User"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateUser}>
              Update User
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpdateUser}>
          {formError && (
            <div className="alert alert-danger mb-md">{formError}</div>
          )}

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="admin@example.com"
            required
          />

          <div className="alert alert-info mb-md" style={{ fontSize: '13px' }}>
            Password cannot be changed here. User must reset password via login page.
          </div>

          <div className="form-group">
            <label className="form-label">
              Role
              <span className="text-danger"> *</span>
            </label>
            <select
              className="form-select"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
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
            <Button variant="danger" onClick={handleDeleteUser}>
              Delete
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete admin user <strong>{selectedUser?.email}</strong>?
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

export default AdminUsers;
