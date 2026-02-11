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
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">Overview of UCP Marketplace performance</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-16 mb-lg">
        <div className="stat-card">
          <div className="stat-card-label">Active Merchants</div>
          <div className="stat-card-value">{stats?.active_merchants || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Total Tenants</div>
          <div className="stat-card-value">{stats?.total_tenants || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Revenue MTD</div>
          <div className="stat-card-value">{formatCurrency(revenueMTD)}</div>
          <div className="stat-card-change text-muted">Total merchant sales</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Estimated Commission (5%)</div>
          <div className="stat-card-value text-success">{formatCurrency(commissionMTD)}</div>
          <div className="stat-card-change text-muted">Our earnings MTD</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16 mb-lg">
        <div className="stat-card">
          <div className="stat-card-label">Searches Today</div>
          <div className="stat-card-value">{stats?.searches_today || 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Referral Conversions Today</div>
          <div className="stat-card-value">{stats?.conversions_today || 0}</div>
          <div className="stat-card-change text-muted">From checkout sessions</div>
        </div>
      </div>

      {/* Charts */}
      {stats?.trends && (
        <div className="grid grid-cols-2 gap-16">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Searches (Last 7 Days)</h3>
            </div>
            <div className="card-body">
              <Line
                data={{
                  labels: stats.trends.dates || [],
                  datasets: [{
                    label: 'Searches',
                    data: stats.trends.searches || [],
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
