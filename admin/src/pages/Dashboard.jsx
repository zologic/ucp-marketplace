import React, { useState, useEffect } from 'react';
import { getDashboardStats } from '../api/client.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
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
  Title,
  Tooltip,
  Legend
);

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await getDashboardStats();
      setStats(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard stats');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
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

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR'
    }).format(cents / 100);
  };

  const revenueMTD = stats?.revenue_mtd_cents || 0;
  const commissionMTD = Math.round(revenueMTD * 0.05); // 5% commission

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <i className="fas fa-gauge-high"></i>
          Dashboard
        </h1>
        <p className="page-description">Overview of UCP Marketplace performance</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-16 mb-lg">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Active Merchants</span>
            <div className="stat-icon">
              <i className="fas fa-shop"></i>
            </div>
          </div>
          <div className="stat-value">{stats?.active_merchants || 0}</div>
        </div>

        <div className="stat-card stat-info">
          <div className="stat-card-header">
            <span className="stat-label">Total Tenants</span>
            <div className="stat-icon">
              <i className="fas fa-building-user"></i>
            </div>
          </div>
          <div className="stat-value">{stats?.total_tenants || 0}</div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-card-header">
            <span className="stat-label">Revenue MTD</span>
            <div className="stat-icon">
              <i className="fas fa-euro-sign"></i>
            </div>
          </div>
          <div className="stat-value">{formatCurrency(revenueMTD)}</div>
          <div className="stat-change text-muted">
            <small>Total merchant sales</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Commission (5%)</span>
            <div className="stat-icon">
              <i className="fas fa-sack-dollar"></i>
            </div>
          </div>
          <div className="stat-value text-success">{formatCurrency(commissionMTD)}</div>
          <div className="stat-change positive">
            <i className="fas fa-arrow-up"></i>
            <small>Our earnings MTD</small>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16 mb-lg">
        <div className="stat-card stat-info">
          <div className="stat-card-header">
            <span className="stat-label">Searches Today</span>
            <div className="stat-icon">
              <i className="fas fa-magnifying-glass"></i>
            </div>
          </div>
          <div className="stat-value">{stats?.searches_today || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Conversions Today</span>
            <div className="stat-icon">
              <i className="fas fa-cart-shopping"></i>
            </div>
          </div>
          <div className="stat-value">{stats?.conversions_today || 0}</div>
          <div className="stat-change text-muted">
            <small>From checkout sessions</small>
          </div>
        </div>
      </div>

      {/* Charts */}
      {stats?.trends && (
        <div className="grid grid-cols-2 gap-16">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="fas fa-chart-line"></i>
                Searches (Last 7 Days)
              </h3>
            </div>
            <div className="card-body">
              <Line
                data={{
                  labels: stats.trends.dates || [],
                  datasets: [{
                    label: 'Searches',
                    data: stats.trends.searches || [],
                    borderColor: '#3fb950',
                    backgroundColor: 'rgba(63, 185, 80, 0.1)',
                    tension: 0.4
                  }]
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    y: {
                      grid: { color: '#30363d' },
                      ticks: { color: '#8b949e' }
                    },
                    x: {
                      grid: { color: '#30363d' },
                      ticks: { color: '#8b949e' }
                    }
                  }
                }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Merchant Revenue (Last 7 Days)</h3>
            </div>
            <div className="card-body">
              <Bar
                data={{
                  labels: stats.trends.dates || [],
                  datasets: [{
                    label: 'Revenue (EUR)',
                    data: (stats.trends.revenue || []).map(v => v / 100),
                    backgroundColor: '#10b981'
                  }]
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (value) => '€' + value
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Conversion Rate (Last 7 Days)</h3>
            </div>
            <div className="card-body">
              <Line
                data={{
                  labels: stats.trends.dates || [],
                  datasets: [{
                    label: 'Conversion Rate (%)',
                    data: stats.trends.conversion_rate || [],
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4
                  }]
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (value) => value + '%'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Commission Earned (Last 7 Days)</h3>
            </div>
            <div className="card-body">
              <Bar
                data={{
                  labels: stats.trends.dates || [],
                  datasets: [{
                    label: 'Commission (EUR)',
                    data: (stats.trends.commission || []).map(v => v / 100),
                    backgroundColor: '#2563eb'
                  }]
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (value) => '€' + value
                      }
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
