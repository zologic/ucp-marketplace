import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TrendingUp, Search, MousePointerClick, ShoppingCart, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
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
  Legend,
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

type DateRange = '7d' | '30d' | '90d';

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const getDateParams = (range: DateRange) => {
    const end = new Date();
    const start = new Date();
    switch (range) {
      case '7d':
        start.setDate(end.getDate() - 7);
        break;
      case '30d':
        start.setDate(end.getDate() - 30);
        break;
      case '90d':
        start.setDate(end.getDate() - 90);
        break;
    }
    return {
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
    };
  };

  const params = getDateParams(dateRange);

  // Fetch overview stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['analytics-overview', params],
    queryFn: async () => {
      const response = await apiClient.get(
        `/analytics/overview?from=${params.from}&to=${params.to}`
      );
      return response.data;
    },
  });

  // Fetch search trends
  const { data: trends } = useQuery({
    queryKey: ['analytics-trends', params],
    queryFn: async () => {
      const response = await apiClient.get(
        `/analytics/searches?from=${params.from}&to=${params.to}&group_by=day`
      );
      return response.data;
    },
  });

  // Fetch top queries
  const { data: topQueries } = useQuery({
    queryKey: ['analytics-top-queries', params],
    queryFn: async () => {
      const response = await apiClient.get(
        `/analytics/top-queries?from=${params.from}&to=${params.to}&limit=20`
      );
      return response.data;
    },
  });

  // Fetch top merchants
  const { data: topMerchants } = useQuery({
    queryKey: ['analytics-top-merchants', params],
    queryFn: async () => {
      const response = await apiClient.get(
        `/analytics/top-merchants?from=${params.from}&to=${params.to}&limit=20`
      );
      return response.data;
    },
  });

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <div className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">Loading analytics...</div>
        </div>
      </div>
    );
  }

  const clickThroughRate = stats?.total_searches > 0
    ? ((stats?.total_clicks || 0) / stats.total_searches) * 100
    : 0;
  const conversionRate = stats?.total_searches > 0
    ? ((stats?.total_orders || 0) / stats.total_searches) * 100
    : 0;
  const avgOrderValue = stats?.total_orders > 0
    ? (stats?.total_revenue_cents || 0) / stats.total_orders
    : 0;

  const chartData = {
    labels: trends?.map((t: any) => new Date(t.date).toLocaleDateString()) || [],
    datasets: [
      {
        label: 'Searches',
        data: trends?.map((t: any) => t.count) || [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1,
      },
    ],
  };

  const merchantChartData = {
    labels: topMerchants?.slice(0, 10).map((m: any) => m.domain) || [],
    datasets: [
      {
        label: 'Conversion Rate (%)',
        data: topMerchants?.slice(0, 10).map((m: any) => m.conversion_rate || 0) || [],
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={(value: DateRange) => setDateRange(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_searches || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.prev_period_searches !== undefined && (
                <>
                  {stats.total_searches > stats.prev_period_searches ? '↑' : '↓'}
                  {' '}
                  {Math.abs(
                    Math.round(
                      ((stats.total_searches - stats.prev_period_searches) /
                        (stats.prev_period_searches || 1)) *
                        100
                    )
                  )}
                  % vs previous period
                </>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Click-Through Rate</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clickThroughRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.total_clicks || 0} clicks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.total_orders || 0} orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total: {formatCurrency(stats?.total_revenue_cents || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Search Volume Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {trends && trends.length > 0 ? (
              <Line data={chartData} options={{ responsive: true, maintainAspectRatio: true }} />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No data available for this period
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Merchants by Conversion</CardTitle>
          </CardHeader>
          <CardContent>
            {topMerchants && topMerchants.length > 0 ? (
              <Bar
                data={merchantChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  scales: { y: { beginAtZero: true } },
                }}
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No merchant data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Search Queries</CardTitle>
          </CardHeader>
          <CardContent>
            {topQueries && topQueries.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-right">Searches</TableHead>
                    <TableHead className="text-right">Conv. %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topQueries.slice(0, 10).map((query: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium truncate max-w-[200px]">
                        {query.query || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-right">{query.count || 0}</TableCell>
                      <TableCell className="text-right">
                        {((query.orders || 0) / (query.count || 1) * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                No query data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performing Merchants</CardTitle>
          </CardHeader>
          <CardContent>
            {topMerchants && topMerchants.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Merchant</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topMerchants.slice(0, 10).map((merchant: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium truncate max-w-[200px]">
                        {merchant.domain}
                      </TableCell>
                      <TableCell className="text-right">{merchant.orders || 0}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(merchant.revenue_cents || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                No merchant data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
