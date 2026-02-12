import React, { useState, useEffect } from 'react';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import { getAnalytics, exportAnalytics, triggerStatsRollup } from '../api/client.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [rollingUp, setRollingUp] = useState(false);

  // Date filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await getAnalytics({
        start_date: startDate,
        end_date: endDate
      });
      setAnalytics(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load analytics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleApplyFilters = (e) => {
    e.preventDefault();
    fetchAnalytics();
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await exportAnalytics({
        start_date: startDate,
        end_date: endDate
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `analytics-${startDate}-${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to export analytics');
    } finally {
      setExporting(false);
    }
  };

  const handleRollup = async () => {
    try {
      setRollingUp(true);
      await triggerStatsRollup();
      // Refresh analytics after rollup
      await fetchAnalytics();
    } catch (err) {
      setError('Failed to trigger stats rollup');
    } finally {
      setRollingUp(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR'
    }).format(cents / 100);
  };

  const formatPercent = (value) => {
    return value.toFixed(2) + '%';
  };

  if (loading && !analytics) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">{error}</div>
    );
  }

  const metrics = analytics?.metrics || {};
  const trends = analytics?.trends || {};

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">
            <i className="fas fa-chart-line"></i>
            Analytics
          </h1>
          <p className="page-description">Track referral conversions and revenue performance</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={handleRollup} disabled={rollingUp}>
            <i className="fas fa-sync"></i>
            {rollingUp ? 'Processing...' : 'Rollup Stats'}
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={exporting}>
            <i className="fas fa-file-csv"></i>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="filters-container">
        <form onSubmit={handleApplyFilters} className="filters-row">
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
          <div className="filter-group flex items-end">
            <Button type="submit" variant="primary">
              <i className="fas fa-filter"></i>
              Apply Filters
            </Button>
          </div>
        </form>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-4 gap-16 mb-lg">
        <div className="stat-card">
          <div className="stat-card-label">Total Searches</div>
          <div className="stat-card-value">{metrics.total_searches || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Total Clicks</div>
          <div className="stat-card-value">{metrics.total_clicks || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Click-Through Rate</div>
          <div className="stat-card-value">
            {formatPercent(metrics.ctr || 0)}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Total Checkouts</div>
          <div className="stat-card-value">{metrics.total_checkouts || 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-16 mb-lg">
        <div className="stat-card">
          <div className="stat-card-label">Referral Conversions</div>
          <div className="stat-card-value text-success">{metrics.referral_conversions || 0}</div>
          <div className="stat-card-change text-muted">Checkout sessions with webhook received</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Conversion Rate</div>
          <div className="stat-card-value">
            {formatPercent(metrics.conversion_rate || 0)}
          </div>
          <div className="stat-card-change text-muted">Conversions / Searches</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Total Revenue</div>
          <div className="stat-card-value">{formatCurrency(metrics.total_revenue_cents || 0)}</div>
          <div className="stat-card-change text-muted">All merchant sales</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-16 mb-lg">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Daily Searches</h3>
          </div>
          <div className="card-body">
            <Line
              data={{
                labels: trends.dates || [],
                datasets: [{
                  label: 'Searches',
                  data: trends.searches || [],
                  borderColor: '#2563eb',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                  tension: 0.4
                }]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false }
                }
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Conversion Funnel</h3>
          </div>
          <div className="card-body">
            <Bar
              data={{
                labels: ['Searches', 'Clicks', 'Checkouts', 'Conversions'],
                datasets: [{
                  label: 'Count',
                  data: [
                    metrics.total_searches || 0,
                    metrics.total_clicks || 0,
                    metrics.total_checkouts || 0,
                    metrics.referral_conversions || 0
                  ],
                  backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6']
                }]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false }
                },
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Revenue & Commission Breakdown */}
      <div className="grid grid-cols-2 gap-16 mb-lg">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Revenue by Tenant</h3>
          </div>
          <div className="card-body">
            {analytics?.revenue_by_tenant && analytics.revenue_by_tenant.length > 0 ? (
              <Pie
                data={{
                  labels: analytics.revenue_by_tenant.map(t => t.tenant_name),
                  datasets: [{
                    data: analytics.revenue_by_tenant.map(t => t.revenue_cents / 100),
                    backgroundColor: [
                      '#2563eb',
                      '#10b981',
                      '#f59e0b',
                      '#8b5cf6',
                      '#ec4899',
                      '#06b6d4'
                    ]
                  }]
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'bottom'
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          return `${context.label}: €${context.parsed.toFixed(2)}`;
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <div className="empty-state">
                <p>No revenue data available</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Commission by Tenant (5%)</h3>
          </div>
          <div className="card-body">
            {analytics?.commission_by_tenant && analytics.commission_by_tenant.length > 0 ? (
              <Pie
                data={{
                  labels: analytics.commission_by_tenant.map(t => t.tenant_name),
                  datasets: [{
                    data: analytics.commission_by_tenant.map(t => t.commission_cents / 100),
                    backgroundColor: [
                      '#2563eb',
                      '#10b981',
                      '#f59e0b',
                      '#8b5cf6',
                      '#ec4899',
                      '#06b6d4'
                    ]
                  }]
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'bottom'
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          return `${context.label}: €${context.parsed.toFixed(2)}`;
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <div className="empty-state">
                <p>No commission data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-2 gap-16">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Top Performing Merchants</h3>
          </div>
          <div className="card-body">
            {analytics?.top_merchants && analytics.top_merchants.length > 0 ? (
              <table className="table">
                <thead className="table-header">
                  <tr>
                    <th className="table-header-cell">Merchant</th>
                    <th className="table-header-cell">Revenue</th>
                    <th className="table-header-cell">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.top_merchants.map((merchant, index) => (
                    <tr key={index} className="table-row">
                      <td className="table-cell">{merchant.domain}</td>
                      <td className="table-cell">{formatCurrency(merchant.revenue_cents)}</td>
                      <td className="table-cell">{merchant.order_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <p>No merchant data available</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Top Searched Products</h3>
          </div>
          <div className="card-body">
            {analytics?.top_products && analytics.top_products.length > 0 ? (
              <table className="table">
                <thead className="table-header">
                  <tr>
                    <th className="table-header-cell">Product</th>
                    <th className="table-header-cell">Searches</th>
                    <th className="table-header-cell">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.top_products.map((product, index) => (
                    <tr key={index} className="table-row">
                      <td className="table-cell">{product.name}</td>
                      <td className="table-cell">{product.search_count}</td>
                      <td className="table-cell">{product.click_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <p>No product data available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
