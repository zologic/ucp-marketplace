import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AuditLog } from '@/types';
import { formatDate, formatRelativeTime } from '@/lib/utils';

const ACTION_COLORS = {
  CREATE: 'bg-green-500',
  UPDATE: 'bg-blue-500',
  DELETE: 'bg-red-500',
  ENABLE: 'bg-green-500',
  DISABLE: 'bg-yellow-500',
  LOGIN: 'bg-green-500',
  SUSPEND: 'bg-yellow-500',
  MERCHANT_CREATE: 'bg-green-500',
  MERCHANT_UPDATE: 'bg-blue-500',
  MERCHANT_DELETE: 'bg-red-500',
  MERCHANT_ENABLE: 'bg-green-500',
  MERCHANT_DISABLE: 'bg-yellow-500',
  TENANT_CREATE: 'bg-green-500',
  TENANT_UPDATE: 'bg-blue-500',
  INVOICE_MARK_PAID: 'bg-green-500',
  ADMIN_CREATE: 'bg-green-500',
  ADMIN_LOGIN: 'bg-green-500',
};

export default function AuditLogs() {
  const [actionFilter, setActionFilter] = useState<string>('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Fetch audit logs
  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs', actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (actionFilter) params.append('action', actionFilter);
      params.append('limit', '100');
      const response = await apiClient.get(`/audit-logs?${params.toString()}`);
      return response.data;
    },
  });

  const toggleRow = (logId: string) => {
    setExpandedRow(expandedRow === logId ? null : logId);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <div className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">Loading audit logs...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Audit Logs</h1>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Action Type</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="MERCHANT_CREATE">Merchant Create</SelectItem>
                  <SelectItem value="MERCHANT_UPDATE">Merchant Update</SelectItem>
                  <SelectItem value="MERCHANT_DELETE">Merchant Delete</SelectItem>
                  <SelectItem value="MERCHANT_ENABLE">Merchant Enable</SelectItem>
                  <SelectItem value="MERCHANT_DISABLE">Merchant Disable</SelectItem>
                  <SelectItem value="TENANT_CREATE">Tenant Create</SelectItem>
                  <SelectItem value="TENANT_UPDATE">Tenant Update</SelectItem>
                  <SelectItem value="ADMIN_LOGIN">Admin Login</SelectItem>
                  <SelectItem value="ADMIN_CREATE">Admin Create</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail ({logs?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No audit logs found for selected filters
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <>
                    <TableRow key={log.id} className="cursor-pointer" onClick={() => toggleRow(log.id)}>
                      <TableCell>
                        {expandedRow === log.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatRelativeTime(log.created_at)}
                      </TableCell>
                      <TableCell>{log.admin_email || 'System'}</TableCell>
                      <TableCell>
                        <Badge className={ACTION_COLORS[log.action as keyof typeof ACTION_COLORS] || 'bg-gray-500'}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.resource_type}: {log.resource_id}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {log.details ? JSON.stringify(log.details).substring(0, 50) + '...' : 'N/A'}
                      </TableCell>
                    </TableRow>
                    {expandedRow === log.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <div className="p-4 space-y-2">
                            <div className="text-sm font-semibold">Full Details:</div>
                            <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-[300px]">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                            <div className="text-xs text-muted-foreground">
                              Full timestamp: {formatDate(log.created_at)} ({new Date(log.created_at).toISOString()})
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
