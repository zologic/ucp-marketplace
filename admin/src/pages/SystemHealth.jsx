import React, { useState, useEffect } from 'react';
import Button from '../components/Button.jsx';
import { getSystemHealth, triggerProductIndexing } from '../api/client.js';

function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [indexing, setIndexing] = useState(false);
  const [indexSuccess, setIndexSuccess] = useState(null);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const response = await getSystemHealth();
      setHealth(response.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to load system health');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();

    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status) => {
    if (status === 'up' || status === 'healthy') return 'badge-success';
    if (status === 'degraded' || status === 'warning') return 'badge-warning';
    return 'badge-danger';
  };

  const getStatusIcon = (status) => {
    if (status === 'up' || status === 'healthy') return '✓';
    if (status === 'degraded' || status === 'warning') return '⚠';
    return '✗';
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatUptime = (seconds) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const handleTriggerIndexing = async () => {
    try {
      setIndexing(true);
      setIndexSuccess(null);
      await triggerProductIndexing();
      setIndexSuccess('Product indexing started successfully. This may take a few minutes.');
      setTimeout(() => setIndexSuccess(null), 5000);
    } catch (err) {
      setError('Failed to trigger product indexing');
      console.error(err);
    } finally {
      setIndexing(false);
    }
  };

  if (loading && !health) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">System Health</h1>
          <p className="page-description">Monitor system status and performance metrics</p>
        </div>
        <div className="flex items-center gap-16">
          <Button
            variant="primary"
            onClick={handleTriggerIndexing}
            disabled={indexing}
          >
            <i className="fas fa-sync-alt"></i>
            {indexing ? 'Indexing...' : 'Re-index Products'}
          </Button>
          {lastUpdated && (
            <span className="text-secondary" style={{ fontSize: '14px' }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <div className="flex items-center gap-8">
            <div className="spinner spinner-sm"></div>
            <span className="text-muted" style={{ fontSize: '12px' }}>Auto-refresh: 10s</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {indexSuccess && (
        <div className="alert alert-success">{indexSuccess}</div>
      )}

      {/* System Status Cards */}
      <div className="grid grid-cols-3 gap-16 mb-lg">
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="card-title">API Status</h3>
            <span className={`badge ${getStatusBadge(health?.api?.status)}`}>
              {getStatusIcon(health?.api?.status)} {health?.api?.status || 'unknown'}
            </span>
          </div>
          <div className="card-body">
            <div className="mb-sm">
              <span className="text-secondary">Response Time:</span>
              <span className="font-semibold ml-sm">{health?.api?.response_time || 'N/A'}ms</span>
            </div>
            <div className="mb-sm">
              <span className="text-secondary">Uptime:</span>
              <span className="font-semibold ml-sm">{formatUptime(health?.api?.uptime_seconds)}</span>
            </div>
            <div>
              <span className="text-secondary">Version:</span>
              <span className="font-semibold ml-sm">{health?.api?.version || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="card-title">Database Status</h3>
            <span className={`badge ${getStatusBadge(health?.database?.status)}`}>
              {getStatusIcon(health?.database?.status)} {health?.database?.status || 'unknown'}
            </span>
          </div>
          <div className="card-body">
            <div className="mb-sm">
              <span className="text-secondary">Connections:</span>
              <span className="font-semibold ml-sm">{health?.database?.connection_count || 0}</span>
            </div>
            <div className="mb-sm">
              <span className="text-secondary">Database Size:</span>
              <span className="font-semibold ml-sm">{formatBytes(health?.database?.size_bytes)}</span>
            </div>
            <div>
              <span className="text-secondary">Query Time (avg):</span>
              <span className="font-semibold ml-sm">{health?.database?.avg_query_time || 'N/A'}ms</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="card-title">MCP Server Status</h3>
            <span className={`badge ${getStatusBadge(health?.mcp_server?.status)}`}>
              {getStatusIcon(health?.mcp_server?.status)} {health?.mcp_server?.status || 'unknown'}
            </span>
          </div>
          <div className="card-body">
            <div className="mb-sm">
              <span className="text-secondary">Merchants in Registry:</span>
              <span className="font-semibold ml-sm">{health?.mcp_server?.merchant_count || 0}</span>
            </div>
            <div className="mb-sm">
              <span className="text-secondary">Active Tenants:</span>
              <span className="font-semibold ml-sm">{health?.mcp_server?.tenant_count || 0}</span>
            </div>
            <div>
              <span className="text-secondary">Last Sync:</span>
              <span className="font-semibold ml-sm">
                {health?.mcp_server?.last_sync ? formatDate(health.mcp_server.last_sync) : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16 mb-lg">
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="card-title">Worker Status</h3>
            <span className={`badge ${getStatusBadge(health?.worker?.status)}`}>
              {getStatusIcon(health?.worker?.status)} {health?.worker?.status || 'unknown'}
            </span>
          </div>
          <div className="card-body">
            {health?.worker?.error && (
              <div className="alert alert-danger mb-md" style={{ fontSize: '13px' }}>
                <strong>Error:</strong> {health.worker.error}
              </div>
            )}
            {health?.worker?.message && (
              <div className="alert alert-info mb-md" style={{ fontSize: '13px' }}>
                {health.worker.message}
              </div>
            )}
            <div className="mb-sm">
              <span className="text-secondary">Job Queue Depth:</span>
              <span className="font-semibold ml-sm">{health?.worker?.queue_depth || 0}</span>
            </div>
            <div className="mb-sm">
              <span className="text-secondary">Jobs Processed (24h):</span>
              <span className="font-semibold ml-sm">{health?.worker?.jobs_processed_24h || 0}</span>
            </div>
            <div className="mb-sm">
              <span className="text-secondary">Failed Jobs (24h):</span>
              <span className="font-semibold ml-sm text-danger">{health?.worker?.failed_jobs_24h || 0}</span>
            </div>
            <div className="mb-sm">
              <span className="text-secondary">Uptime:</span>
              <span className="font-semibold ml-sm">{formatUptime(health?.worker?.uptime_seconds)}</span>
            </div>
            <div>
              <span className="text-secondary">Next Crawl Scheduled:</span>
              <span className="font-semibold ml-sm">
                {health?.worker?.next_crawl ? formatDate(health.worker.next_crawl) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="card-title">Redis Status</h3>
            <span className={`badge ${getStatusBadge(health?.redis?.status)}`}>
              {getStatusIcon(health?.redis?.status)} {health?.redis?.status || 'unknown'}
            </span>
          </div>
          <div className="card-body">
            <div className="mb-sm">
              <span className="text-secondary">Memory Usage:</span>
              <span className="font-semibold ml-sm">{formatBytes(health?.redis?.memory_used_bytes)}</span>
            </div>
            <div className="mb-sm">
              <span className="text-secondary">Memory Peak:</span>
              <span className="font-semibold ml-sm">{formatBytes(health?.redis?.memory_peak_bytes)}</span>
            </div>
            <div className="mb-sm">
              <span className="text-secondary">Connected Clients:</span>
              <span className="font-semibold ml-sm">{health?.redis?.connected_clients || 0}</span>
            </div>
            <div>
              <span className="text-secondary">Uptime:</span>
              <span className="font-semibold ml-sm">{formatUptime(health?.redis?.uptime_seconds)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* System Metrics */}
      <div className="card mb-lg">
        <div className="card-header">
          <h3 className="card-title">System Metrics (24h)</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-4 gap-16">
            <div>
              <div className="text-secondary mb-sm">Total Requests</div>
              <div className="font-bold" style={{ fontSize: '24px' }}>
                {health?.metrics?.total_requests_24h?.toLocaleString() || 0}
              </div>
            </div>
            <div>
              <div className="text-secondary mb-sm">Avg Response Time</div>
              <div className="font-bold" style={{ fontSize: '24px' }}>
                {health?.metrics?.avg_response_time || 0}ms
              </div>
            </div>
            <div>
              <div className="text-secondary mb-sm">Error Rate</div>
              <div className="font-bold" style={{ fontSize: '24px' }}>
                {health?.metrics?.error_rate || 0}%
              </div>
            </div>
            <div>
              <div className="text-secondary mb-sm">Search Queries</div>
              <div className="font-bold" style={{ fontSize: '24px' }}>
                {health?.metrics?.search_queries_24h?.toLocaleString() || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Errors */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Errors (Last 50)</h3>
        </div>
        <div className="card-body">
          {health?.recent_errors && health.recent_errors.length > 0 ? (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="table">
                <thead className="table-header">
                  <tr>
                    <th className="table-header-cell">Timestamp</th>
                    <th className="table-header-cell">Error Type</th>
                    <th className="table-header-cell">Message</th>
                    <th className="table-header-cell">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {health.recent_errors.map((error, index) => (
                    <tr key={index} className="table-row">
                      <td className="table-cell" style={{ fontSize: '12px' }}>
                        {formatDate(error.timestamp)}
                      </td>
                      <td className="table-cell">
                        <span className="badge badge-danger">{error.type}</span>
                      </td>
                      <td className="table-cell" style={{ fontSize: '13px' }}>
                        {error.message}
                      </td>
                      <td className="table-cell text-muted" style={{ fontSize: '12px' }}>
                        {error.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">✓</div>
              <h3 className="empty-state-title">No Recent Errors</h3>
              <p className="empty-state-description">All systems operating normally</p>
            </div>
          )}
        </div>
      </div>

      {/* System Info */}
      <div className="card mt-lg">
        <div className="card-header">
          <h3 className="card-title">System Information</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-3 gap-16">
            <div>
              <div className="text-secondary mb-sm">Environment</div>
              <div className="font-semibold">{health?.system?.environment || 'production'}</div>
            </div>
            <div>
              <div className="text-secondary mb-sm">Node Version</div>
              <div className="font-semibold">{health?.system?.node_version || 'N/A'}</div>
            </div>
            <div>
              <div className="text-secondary mb-sm">Platform</div>
              <div className="font-semibold">{health?.system?.platform || 'N/A'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SystemHealth;
