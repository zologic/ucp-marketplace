import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Plus, RefreshCw } from 'lucide-react';
import type { Merchant, Tenant } from '@/types';

const STATUS_COLORS = {
  PENDING: 'bg-yellow-500',
  ACTIVE: 'bg-green-500',
  DISABLED: 'bg-gray-500',
  SUSPENDED: 'bg-red-500',
  VERIFICATION_FAILED: 'bg-red-500',
  verified: 'bg-green-500',
  pending: 'bg-yellow-500',
  active: 'bg-green-500',
  suspended: 'bg-red-500',
};

export default function Merchants() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    domain: '',
    tenant_id: '',
    billing_mode: 'COMMISSION',
    commission_rate_bps: 1000,
    cpc_rate_cents: 50,
  });

  // Fetch merchants
  const { data: merchants, isLoading, isError, error } = useQuery<Merchant[]>({
    queryKey: ['merchants', statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);
      const response = await apiClient.get(`/merchants?${params.toString()}`);
      return response.data;
    },
  });

  // Fetch tenants for dropdown
  const { data: tenants } = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn: async () => {
      const response = await apiClient.get('/tenants');
      return response.data;
    },
  });

  // Add merchant mutation
  const addMerchantMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiClient.post('/merchants', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      setAddDialogOpen(false);
      setFormData({
        domain: '',
        tenant_id: '',
        billing_mode: 'COMMISSION',
        commission_rate_bps: 1000,
        cpc_rate_cents: 50,
      });
      toast({
        title: 'Merchant added',
        description: 'Merchant added successfully. Verifying UCP...',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to add merchant',
        variant: 'destructive',
      });
    },
  });

  // Update merchant status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiClient.patch(`/merchants/${id}`, { status });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      toast({
        title: 'Status updated',
        description: 'Merchant status updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update status',
        variant: 'destructive',
      });
    },
  });

  // Verify merchant mutation
  const verifyMerchantMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post(`/merchants/${id}/verify`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      toast({
        title: 'Verification initiated',
        description: 'UCP verification in progress',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Verification failed',
        description: error.response?.data?.error || 'UCP verification failed',
        variant: 'destructive',
      });
    },
  });

  const handleAddMerchant = () => {
    addMerchantMutation.mutate(formData);
  };

  const handleToggleStatus = (merchant: Merchant) => {
    const newStatus = merchant.status === 'active' || merchant.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    updateStatusMutation.mutate({ id: merchant.id, status: newStatus });
  };

  const handleVerify = (merchantId: string) => {
    verifyMerchantMutation.mutate(merchantId);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Merchants</h1>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">Loading merchants...</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Merchants</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="text-red-500 text-lg font-semibold">Failed to load merchants</div>
              <p className="text-muted-foreground text-center max-w-md">
                {error instanceof Error ? error.message : 'Unable to connect to the API. Please check your connection and try again.'}
              </p>
              <Button onClick={() => window.location.reload()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredMerchants = merchants || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Merchants</h1>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Merchant
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Search Domain</Label>
              <Input
                placeholder="Search by domain..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DISABLED">Disabled</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="VERIFICATION_FAILED">Verification Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Merchants ({filteredMerchants.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredMerchants.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No merchants found. Add your first merchant to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Billing Mode</TableHead>
                  <TableHead>Last Verified</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMerchants.map((merchant) => (
                  <TableRow key={merchant.id}>
                    <TableCell className="font-medium">{merchant.domain}</TableCell>
                    <TableCell>{merchant.tenant_name || merchant.tenant_domain || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[merchant.status as keyof typeof STATUS_COLORS] || 'bg-gray-500'}>
                        {merchant.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{merchant.billing_mode || 'N/A'}</TableCell>
                    <TableCell>
                      {merchant.last_verified_at
                        ? new Date(merchant.last_verified_at).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleStatus(merchant)}
                          disabled={updateStatusMutation.isPending}
                        >
                          {merchant.status === 'active' || merchant.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                        </Button>
                        {(merchant.status === 'VERIFICATION_FAILED' || merchant.status === 'PENDING') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVerify(merchant.id)}
                            disabled={verifyMerchantMutation.isPending}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" />
                            Verify
                          </Button>
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

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Merchant</DialogTitle>
            <DialogDescription>
              Add a new merchant to the directory. UCP verification will run automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="shop.example.com"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tenant">Tenant</Label>
              <Select
                value={formData.tenant_id}
                onValueChange={(value) => setFormData({ ...formData, tenant_id: value })}
              >
                <SelectTrigger id="tenant">
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants?.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.domain})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="billing_mode">Billing Mode</Label>
              <Select
                value={formData.billing_mode}
                onValueChange={(value) => setFormData({ ...formData, billing_mode: value })}
              >
                <SelectTrigger id="billing_mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CPC">CPC (Cost Per Click)</SelectItem>
                  <SelectItem value="COMMISSION">Commission</SelectItem>
                  <SelectItem value="HYBRID">Hybrid (CPC + Commission)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(formData.billing_mode === 'COMMISSION' || formData.billing_mode === 'HYBRID') && (
              <div className="grid gap-2">
                <Label htmlFor="commission_rate">Commission Rate (%)</Label>
                <Input
                  id="commission_rate"
                  type="number"
                  step="0.1"
                  value={formData.commission_rate_bps / 100}
                  onChange={(e) =>
                    setFormData({ ...formData, commission_rate_bps: parseFloat(e.target.value) * 100 })
                  }
                />
              </div>
            )}
            {(formData.billing_mode === 'CPC' || formData.billing_mode === 'HYBRID') && (
              <div className="grid gap-2">
                <Label htmlFor="cpc_rate">CPC Rate (cents)</Label>
                <Input
                  id="cpc_rate"
                  type="number"
                  value={formData.cpc_rate_cents}
                  onChange={(e) => setFormData({ ...formData, cpc_rate_cents: parseInt(e.target.value) })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMerchant} disabled={addMerchantMutation.isPending}>
              {addMerchantMutation.isPending ? 'Adding...' : 'Add Merchant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
