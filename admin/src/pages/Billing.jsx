import React, { useState, useEffect } from 'react';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import Table from '../components/Table.jsx';
import {
  getBillingInvoices,
  getInvoicePdf,
  markInvoicePaid,
  sendInvoiceReminder
} from '../api/client.js';

function Billing() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Summary stats
  const [summary, setSummary] = useState({
    total_outstanding: 0,
    total_collected_mtd: 0,
    overdue_count: 0,
    pending_commissions: 0
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        month: monthFilter || undefined,
        search: searchQuery || undefined
      };
      const response = await getBillingInvoices(params);
      setInvoices(response.data.invoices || []);
      setTotalPages(response.data.total_pages || 1);
      setSummary(response.data.summary || summary);
      setError(null);
    } catch (err) {
      setError('Failed to load invoices');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [page, statusFilter, monthFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchInvoices();
  };

  const handleDownloadPdf = async (invoiceId) => {
    try {
      const response = await getInvoicePdf(invoiceId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice-${invoiceId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download PDF');
    }
  };

  const handleMarkPaid = async (invoiceId) => {
    if (!confirm('Mark this invoice as paid?')) return;

    try {
      await markInvoicePaid(invoiceId);
      fetchInvoices();
    } catch (err) {
      setError('Failed to mark invoice as paid');
    }
  };

  const handleSendReminder = async (invoiceId) => {
    try {
      await sendInvoiceReminder(invoiceId);
      alert('Reminder sent successfully');
    } catch (err) {
      setError('Failed to send reminder');
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR'
    }).format(cents / 100);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'badge-secondary',
      invoiced: 'badge-primary',
      paid: 'badge-success',
      overdue: 'badge-danger'
    };
    return `badge ${badges[status] || 'badge-secondary'}`;
  };

  const isOverdue = (invoice) => {
    if (invoice.status === 'paid') return false;
    const dueDate = new Date(invoice.due_date);
    return dueDate < new Date();
  };

  const columns = [
    {
      key: 'invoice_id',
      label: 'Invoice ID',
      sortable: true,
      render: (row) => <span className="font-semibold">{row.invoice_id}</span>
    },
    {
      key: 'merchant_name',
      label: 'Merchant',
      sortable: true,
      render: (row) => row.merchant_name || row.merchant_domain
    },
    {
      key: 'tenant',
      label: 'Tenant',
      sortable: true,
      render: (row) => row.tenant_name
    },
    {
      key: 'period',
      label: 'Period',
      sortable: true,
      render: (row) => row.period
    },
    {
      key: 'amount_cents',
      label: 'Amount',
      sortable: true,
      render: (row) => <span className="font-semibold">{formatCurrency(row.amount_cents)}</span>
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => {
        const status = isOverdue(row) && row.status !== 'paid' ? 'overdue' : row.status;
        return <span className={getStatusBadge(status)}>{status}</span>;
      }
    },
    {
      key: 'generated_at',
      label: 'Generated',
      sortable: true,
      render: (row) => formatDate(row.generated_at)
    },
    {
      key: 'due_date',
      label: 'Due Date',
      sortable: true,
      render: (row) => (
        <span className={isOverdue(row) && row.status !== 'paid' ? 'text-danger' : ''}>
          {formatDate(row.due_date)}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="table-actions">
          <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(row.id)}>
            <i className="fas fa-download"></i>
            Download
          </Button>
          {row.status !== 'paid' && (
            <>
              <Button variant="success" size="sm" onClick={() => handleMarkPaid(row.id)}>
                Mark Paid
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleSendReminder(row.id)}>
                Remind
              </Button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-file-invoice-dollar"></i>
          Billing
        </h1>
        <p className="page-description">Manage invoices and track commission payments</p>
      </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-16 mb-lg">
        <div className="stat-card">
          <div className="stat-card-label">Total Outstanding</div>
          <div className="stat-card-value text-warning">
            {formatCurrency(summary.total_outstanding)}
          </div>
          <div className="stat-card-change text-muted">Unpaid + Overdue invoices</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Collected MTD</div>
          <div className="stat-card-value text-success">
            {formatCurrency(summary.total_collected_mtd)}
          </div>
          <div className="stat-card-change text-muted">This month</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Overdue Invoices</div>
          <div className="stat-card-value text-danger">{summary.overdue_count}</div>
          <div className="stat-card-change text-muted">Past 30 days</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Pending Commissions</div>
          <div className="stat-card-value">{formatCurrency(summary.pending_commissions)}</div>
          <div className="stat-card-change text-muted">Not yet invoiced</div>
        </div>
      </div>

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
              <option value="invoiced">Invoiced</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label">Period (YYYY-MM)</label>
            <input
              type="text"
              className="form-input"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              placeholder="2025-01"
            />
          </div>
          <div className="filter-group">
            <label className="form-label">Search Merchant</label>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by merchant..."
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

      {/* Invoices Table */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <Table columns={columns} data={invoices} />

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

      {/* Billing Info */}
      <div className="card mt-lg">
        <div className="card-header">
          <h3 className="card-title">Billing Information</h3>
        </div>
        <div className="card-body">
          <div className="mb-md">
            <h4 className="font-semibold mb-sm">Invoice Components</h4>
            <ul style={{ paddingLeft: '20px', color: 'var(--text-secondary)' }}>
              <li>Monthly plugin fee: €99</li>
              <li>Commission: 5% of merchant sales (tracked via checkout_sessions)</li>
              <li>Payment terms: Net 30 days</li>
            </ul>
          </div>
          <div className="mb-md">
            <h4 className="font-semibold mb-sm">Billing Workflow</h4>
            <ol style={{ paddingLeft: '20px', color: 'var(--text-secondary)' }}>
              <li>Order webhook received → billable_event created (status: pending)</li>
              <li>Monthly invoice generation → status changes to invoiced</li>
              <li>Merchant pays → status changes to paid</li>
              <li>If unpaid after 30 days → status becomes overdue</li>
            </ol>
          </div>
          <div className="alert alert-info mb-0">
            <strong>MCP Enforcement:</strong> Merchants with invoices in "overdue" status (&gt;30 days)
            are automatically excluded from search results until payment is received.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Billing;
