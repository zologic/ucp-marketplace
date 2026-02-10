import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, Server, Activity, AlertTriangle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { SystemHealth } from '@/types';

const STATUS_COLORS = {
  HEALTHY: 'bg-green-500',
  DEGRADED: 'bg-yellow-500',
  DOWN: 'bg-red-500',
  UNKNOWN: 'bg-gray-500',
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
  unknown: 'bg-gray-500',
  ok: 'bg-green-500',
  error: 'bg-red-500',
};

export default function SystemHealth() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Fetch system health
  const { data: health, isLoading, refetch } = useQuery<SystemHealth>({
    queryKey: ['system-health'],
    queryFn: async () => {
      const response = await apiClient.get('/health');
      setLastRefresh(new Date());
      return response.data;
    },
    refetchInterval: autoRefresh ? 30000 : false, // Auto-refresh every 30s
  });

  const handleRefresh = () => {
    refetch();
  };

  const getOverallStatus = () => {
    if (!health) return 'UNKNOWN';
    const services = Object.values(health.services || {});
    const hasDown = services.some((s: any) => s.status === 'down' || s.status === 'error');
    const hasDegraded = services.some((s: any) => s.status === 'degraded');
    if (hasDown) return 'DOWN';
    if (hasDegraded) return 'DEGRADED';
    return 'HEALTHY';
  };

  const overallStatus = getOverallStatus();

  if (isLoading && !health) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">System Health</h1>
        <div className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">Loading system health...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">System Health</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      <Card className={overallStatus === 'DOWN' ? 'border-red-500' : ''}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Overall System Status</CardTitle>
            <Badge className={STATUS_COLORS[overallStatus.toLowerCase() as keyof typeof STATUS_COLORS] || 'bg-gray-500'} style={{ fontSize: '1.2rem', padding: '0.5rem 1rem' }}>
              {overallStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Last updated: {formatRelativeTime(lastRefresh.toISOString())}
          </div>
          {overallStatus === 'DOWN' && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">ALERT: One or more services are down</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Service Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Database Service */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Database (PostgreSQL)</CardTitle>
            <Database className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge className={STATUS_COLORS[(health?.services?.database?.status || 'unknown').toLowerCase() as keyof typeof STATUS_COLORS] || 'bg-gray-500'}>
              {health?.services?.database?.status || 'UNKNOWN'}
            </Badge>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connections:</span>
                <span className="font-medium">{health?.services?.database?.connections || 'N/A'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Redis Service */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Redis Cache</CardTitle>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge className={STATUS_COLORS[(health?.services?.redis?.status || 'unknown').toLowerCase() as keyof typeof STATUS_COLORS] || 'bg-gray-500'}>
              {health?.services?.redis?.status || 'UNKNOWN'}
            </Badge>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Memory:</span>
                <span className="font-medium">
                  {health?.services?.redis?.memory_used_bytes
                    ? `${(health.services.redis.memory_used_bytes / 1024 / 1024).toFixed(1)} MB`
                    : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MCP Server */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">MCP Server</CardTitle>
            <Server className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge className={STATUS_COLORS[(health?.services?.mcp_server?.status || 'unknown').toLowerCase() as keyof typeof STATUS_COLORS] || 'bg-gray-500'}>
              {health?.services?.mcp_server?.status || 'UNKNOWN'}
            </Badge>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Reload:</span>
                <span className="font-medium text-xs">
                  {health?.services?.mcp_server?.last_reload
                    ? formatRelativeTime(health.services.mcp_server.last_reload)
                    : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Worker Service */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Background Worker</CardTitle>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge className={STATUS_COLORS[(health?.services?.worker?.status || 'unknown').toLowerCase() as keyof typeof STATUS_COLORS] || 'bg-gray-500'}>
              {health?.services?.worker?.status || 'UNKNOWN'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* System Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>System Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Merchants</div>
              <div className="text-2xl font-bold">{health?.metrics?.total_merchants || 0}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Tenants</div>
              <div className="text-2xl font-bold">{health?.metrics?.total_tenants || 0}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Products</div>
              <div className="text-2xl font-bold">{health?.metrics?.total_products || 0}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Database Size</div>
              <div className="text-2xl font-bold">
                {health?.metrics?.db_size_bytes
                  ? `${(health.metrics.db_size_bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
                  : 'N/A'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
