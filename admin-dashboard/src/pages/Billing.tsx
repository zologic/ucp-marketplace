import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from '@/hooks/use-toast';
import { FileText, AlertCircle, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import type { Invoice } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_COLORS = {
  draft: 'bg-gray-500',
  issued: 'bg-blue-500',
  paid: 'bg-green-500',
  overdue: 'bg-red-500',
  DRAFT: 'bg-gray-500',
  SENT: 'bg-blue-500',
  ISSUED: 'bg-blue-500',
  PAID: 'bg-green-500',
  OVERDUE: 'bg-red-500',
};

export default function Billing() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch billing overview
  const { data: overview } = useQuery({
    queryKey: ['billing-overview'],
    queryFn: async () => {
      const response = await apiClient.get('/billing/overview');
      return response.data;
    },
  });

  // Fetch invoices
  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '100');
      const response = await apiClient.get(`/billing/invoices?${params.toString()}`);
      return response.data;
    },
  });

  // Mark as paid mutation
  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await apiClient.post(`/billing/invoices/${invoiceId}/mark-paid`, {
        paid_at: new Date().toISOString(),
        payment_method: 'manual',
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      toast({
        title: 'Invoice marked as paid',
        description: 'Invoice status updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to mark invoice as paid',
        variant: 'destructive',
      });
    },
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await apiClient.post(`/billing/invoices/${invoiceId}/send-reminder`);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: 'Reminder sent',
        description: 'Payment reminder email sent to merchant',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to send reminder',
        variant: 'destructive',
      });
    },
  });

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);
  };

  const handleMarkPaid = (invoiceId: string) => {
    if (confirm('Mark this invoice as PAID?')) {
      markPaidMutation.mutate(invoiceId);
    }
  };

  const handleSendReminder = (invoiceId: string) => {
    if (confirm('Send payment reminder to merchant?')) {
      sendReminderMutation.mutate(invoiceId);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Billing</h1>
        <div className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">Loading invoices...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Billing</h1>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(overview?.outstanding_amount_cents || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.outstanding_count || 0} invoice{overview?.outstanding_count !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid This Month</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(overview?.paid_mtd_cents || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.paid_mtd_count || 0} invoice{overview?.paid_mtd_count !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(overview?.overdue_amount_cents || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.overdue_count || 0} invoice{overview?.overdue_count !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Revenue MTD</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(overview?.platform_revenue_mtd_cents || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {overview?.overdue_count > 0 && (
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">
                You have {overview.overdue_count} overdue invoice{overview.overdue_count !== 1 ? 's' : ''} totaling{' '}
                {formatCurrency(overview.overdue_amount_cents || 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="w-[200px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="ISSUED">Issued</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices ({invoices?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!invoices || invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No invoices found. Generate invoices to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.merchant_domain || 'N/A'}</TableCell>
                    <TableCell>
                      {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.total_cents)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[invoice.status as keyof typeof STATUS_COLORS] || 'bg-gray-500'}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{invoice.due_at ? formatDate(invoice.due_at) : 'N/A'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleViewInvoice(invoice)}>
                          <FileText className="mr-1 h-3 w-3" />
                          View
                        </Button>
                        {(invoice.status === 'issued' || invoice.status === 'ISSUED' || invoice.status === 'SENT' || invoice.status === 'OVERDUE' || invoice.status === 'overdue') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkPaid(invoice.id)}
                              disabled={markPaidMutation.isPending}
                            >
                              Mark Paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendReminder(invoice.id)}
                              disabled={sendReminderMutation.isPending}
                            >
                              Remind
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              Invoice {selectedInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Merchant</div>
                  <div className="text-sm">{selectedInvoice.merchant_domain}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                  <Badge className={STATUS_COLORS[selectedInvoice.status as keyof typeof STATUS_COLORS] || 'bg-gray-500'}>
                    {selectedInvoice.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Period</div>
                  <div className="text-sm">
                    {formatDate(selectedInvoice.period_start)} - {formatDate(selectedInvoice.period_end)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Due Date</div>
                  <div className="text-sm">
                    {selectedInvoice.due_at ? formatDate(selectedInvoice.due_at) : 'N/A'}
                  </div>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="text-lg font-semibold">Total Amount</div>
                <div className="text-2xl font-bold">{formatCurrency(selectedInvoice.total_cents)}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
