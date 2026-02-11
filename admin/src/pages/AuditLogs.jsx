import React, { useState, useEffect } from 'react';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import Table from '../components/Table.jsx';
import { getAuditLogs } from '../api/client.js';

function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [adminFilter, setAdminFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityIdSearch, setEntityIdSearch] = useState('');

  // Admin users list for filter
  const [adminUsers, setAdminUsers] = useState([]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 50,
        start_date: startDate,
        end_date: endDate,
        admin_user: adminFilter !== 'all' ? adminFilter : undefined,
        action: actionFilter !== 'all' ? actionFilter : undefined,
        entity_id: entityIdSearch || undefined
      };
      const response = await getAuditLogs(params);
      setLogs(response.data.logs || []);
      setTotalPages(response.data.total_pages || 1);
      setAdminUsers(response.data.admin_users || []);
      setError(null);
    } catch (err) {
      setError('Failed to load audit logs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const handleApplyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatJson = (jsonData) => {
    if (!jsonData) return 'N/A';
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonData.toString();
    }
  };

  const getActionBadge = (action) => {
    if (action.includes('create')) return 'badge-success';
    if (action.includes('update')) return 'badge-primary';
    if (action.includes('delete')) return 'badge-danger';
    if (action.includes('suspend') || action.includes('deactivate')) return 'badge-warning';
    return 'badge-secondary';
  };

  const expandDetails = (log) => {
    alert(formatJson(log.details));
  };

  const columns = [
    {
      key: 'timestamp',
      label: 'Timestamp',
      sortable: true,
      render: (row) => <span className="text-secondary">{formatDate(row.timestamp)}</span>
    },
    {
      key: 'admin_email',
      label: 'Admin User',
      sortable: true,
      render: (row) => <span className="font-semibold">{row.admin_email}</span>
    },
    {
      key: 'action',
      label: 'Action',
      sortable: true,
      render: (row) => <span className={`badge ${getActionBadge(row.action)}`}>{row.action}</span>
    },
    {
      key: 'entity_type',
      label: 'Entity Type',
      sortable: true,
      render: (row) => row.entity_type
    },
    {
      key: 'entity_id',
      label: 'Entity ID',
      render: (row) => (
        <span className="text-muted" style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          {row.entity_id?.substring(0, 8)}...
        </span>
      )
    },
    {
      key: 'details',
      label: 'Details',
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => expandDetails(row)}>
          <i className="fas fa-code"></i>
          View JSON
        </Button>
      )
    }
  ];

  // Common actions for filter
  const commonActions = [
    'create_merchant',
    'update_merchant',
    'delete_merchant',
    'suspend_merchant',
    'activate_merchant',
    'create_tenant',
    'update_tenant',
    'create_admin_user',
    'update_admin_user',
    'delete_admin_user',
    'mark_invoice_paid',
    'send_invoice_reminder',
    'update_billing'
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-clipboard-list"></i>
          Audit Logs
        </h1>
        <p className="page-description">Track all administrative actions and changes</p>
      </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {/* Filters */}
      <div className="filters-container">
        <form onSubmit={handleApplyFilters}>
          <div className="filters-row mb-md">
            <div className="filter-group">
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label className="form-label">End Date</label>
              <input
                type="date"
                className="form-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label className="form-label">Admin User</label>
              <select
                className="form-select"
                value={adminFilter}
                onChange={(e) => setAdminFilter(e.target.value)}
              >
                <option value="all">All Users</option>
                {adminUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="filters-row">
            <div className="filter-group">
              <label className="form-label">Action Type</label>
              <select
                className="form-select"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                <option value="all">All Actions</option>
                {commonActions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label className="form-label">Search Entity ID</label>
              <Input
                value={entityIdSearch}
                onChange={(e) => setEntityIdSearch(e.target.value)}
                placeholder="Enter entity UUID..."
              />
            </div>
            <div className="filter-group flex items-end">
              <Button type="submit" variant="primary">
                <i className="fas fa-filter"></i>
                Apply Filters
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Info Alert */}
      <div className="alert alert-info mb-lg">
        <strong>Audit Trail:</strong> All administrative actions are logged with timestamp, user, action type, and affected entity details for compliance and security purposes.
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <Table columns={columns} data={logs} />

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

      {/* Log Details Info */}
      <div className="card mt-lg">
        <div className="card-header">
          <h3 className="card-title">Audit Log Structure</h3>
        </div>
        <div className="card-body">
          <p className="text-secondary mb-md">
            Each audit log entry contains the following information:
          </p>
          <ul style={{ paddingLeft: '20px', color: 'var(--text-secondary)' }}>
            <li><strong>Timestamp:</strong> When the action occurred (UTC)</li>
            <li><strong>Admin User:</strong> Email of the admin who performed the action</li>
            <li><strong>Action:</strong> Type of action (e.g., create_merchant, update_billing)</li>
            <li><strong>Entity Type:</strong> Type of entity affected (merchant, tenant, user, etc.)</li>
            <li><strong>Entity ID:</strong> Unique identifier of the affected entity</li>
            <li><strong>Details:</strong> JSON object containing before/after values and metadata</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default AuditLogs;
