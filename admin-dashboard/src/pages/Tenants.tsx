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
import { toast } from '@/hooks/use-toast';
import { Plus, Building2, TrendingUp } from 'lucide-react';
import type { Tenant } from '@/types';
import { formatCurrency } from '@/lib/utils';

export default function Tenants() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    revenue_split_bps: 0,
    contact_email: '',
    notes: '',
  });

  // Fetch tenants
  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn: async () => {
      const response = await apiClient.get('/tenants');
      return response.data;
    },
  });

  // Create/Update tenant mutation
  const saveTenantMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingTenant) {
        const response = await apiClient.patch(`/tenants/${editingTenant.id}`, data);
        return response.data;
      } else {
        const response = await apiClient.post('/tenants', data);
        return response.data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setDialogOpen(false);
      setEditingTenant(null);
      resetForm();
      toast({
        title: editingTenant ? 'Tenant updated' : 'Tenant created',
        description: editingTenant
          ? 'Tenant updated successfully'
          : 'Tenant created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save tenant',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      domain: '',
      revenue_split_bps: 0,
      contact_email: '',
      notes: '',
    });
  };

  const handleOpenDialog = (tenant?: Tenant) => {
    if (tenant) {
      setEditingTenant(tenant);
      setFormData({
        name: tenant.name,
        domain: tenant.domain,
        revenue_split_bps: (tenant as any).revenue_split_bps || 0,
        contact_email: (tenant as any).contact_email || '',
        notes: (tenant as any).notes || '',
      });
    } else {
      setEditingTenant(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSaveTenant = () => {
    saveTenantMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Tenants</h1>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">Loading tenants...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Tenants</h1>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Create Tenant
        </Button>
      </div>

      {!tenants || tenants.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              No tenants found. Create your first tenant to enable multi-tenancy.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((tenant) => {
            const revenueSplitPercent = ((tenant as any).revenue_split_bps || 0) / 100;
            const isPartner = revenueSplitPercent > 0;

            return (
              <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{tenant.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{tenant.domain}</p>
                    </div>
                    {isPartner ? (
                      <Badge className="bg-purple-500">Partner {revenueSplitPercent}%</Badge>
                    ) : (
                      <Badge className="bg-blue-500">Platform</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {tenant.merchant_count || 0} active merchant{tenant.merchant_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span>Revenue MTD: {formatCurrency((tenant as any).revenue_mtd_cents || 0)}</span>
                  </div>
                  <div className="pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleOpenDialog(tenant)}
                    >
                      Manage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTenant ? 'Edit Tenant' : 'Create Tenant'}</DialogTitle>
            <DialogDescription>
              {editingTenant
                ? 'Update tenant information and revenue sharing settings'
                : 'Create a new tenant for white-label partnership or platform operation'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Tenant Name</Label>
              <Input
                id="name"
                placeholder="SOHO Fashion Network"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="soho-fashion.example.com"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                disabled={!!editingTenant}
              />
              {editingTenant && (
                <p className="text-xs text-muted-foreground">
                  Domain cannot be changed after creation
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="revenue_split">Revenue Split (%)</Label>
              <Input
                id="revenue_split"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="0 for platform-owned, >0 for white-label partners"
                value={formData.revenue_split_bps / 100}
                onChange={(e) =>
                  setFormData({ ...formData, revenue_split_bps: parseFloat(e.target.value || '0') * 100 })
                }
              />
              <p className="text-xs text-muted-foreground">
                0% = Platform tenant | &gt;0% = White-label partner (revenue share)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input
                id="contact_email"
                type="email"
                placeholder="contact@example.com"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <textarea
                id="notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Internal notes about this tenant..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTenant} disabled={saveTenantMutation.isPending}>
              {saveTenantMutation.isPending
                ? 'Saving...'
                : editingTenant
                ? 'Update Tenant'
                : 'Create Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
