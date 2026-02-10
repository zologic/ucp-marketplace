import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
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
import { Plus, Shield, ShieldAlert } from 'lucide-react';
import type { Admin } from '@/types';
import { formatDate, formatRelativeTime } from '@/lib/utils';

export default function AdminUsers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'admin' as 'admin' | 'superadmin',
    full_name: '',
  });

  // Check if current user is superadmin
  useEffect(() => {
    if (user && user.role !== 'superadmin') {
      toast({
        title: 'Unauthorized',
        description: 'Superadmin access required',
        variant: 'destructive',
      });
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Fetch admin users
  const { data: admins, isLoading } = useQuery<Admin[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await apiClient.get('/admin-users');
      return response.data;
    },
    enabled: user?.role === 'superadmin',
  });

  // Create/Update admin mutation
  const saveAdminMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingAdmin) {
        const { password, ...updateData } = data;
        const response = await apiClient.patch(`/admin-users/${editingAdmin.id}`, updateData);
        return response.data;
      } else {
        const response = await apiClient.post('/admin-users', data);
        return response.data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDialogOpen(false);
      setEditingAdmin(null);
      resetForm();
      toast({
        title: editingAdmin ? 'Admin updated' : 'Admin created',
        description: editingAdmin
          ? 'Admin user updated successfully'
          : 'Admin user created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save admin user',
        variant: 'destructive',
      });
    },
  });

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'disabled' }) => {
      const response = await apiClient.patch(`/admin-users/${id}`, { status });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Status updated',
        description: 'Admin status updated successfully',
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

  // Delete admin mutation
  const deleteAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/admin-users/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Admin deleted',
        description: 'Admin user deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete admin',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      role: 'admin',
      full_name: '',
    });
  };

  const handleOpenDialog = (admin?: Admin) => {
    if (admin) {
      setEditingAdmin(admin);
      setFormData({
        email: admin.email,
        password: '',
        role: admin.role,
        full_name: (admin as any).full_name || '',
      });
    } else {
      setEditingAdmin(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSaveAdmin = () => {
    if (!editingAdmin && !formData.password) {
      toast({
        title: 'Validation error',
        description: 'Password is required for new admins',
        variant: 'destructive',
      });
      return;
    }
    if (!editingAdmin && formData.password.length < 12) {
      toast({
        title: 'Validation error',
        description: 'Password must be at least 12 characters',
        variant: 'destructive',
      });
      return;
    }
    saveAdminMutation.mutate(formData);
  };

  const handleToggleStatus = (admin: Admin) => {
    const currentStatus = (admin as any).status || 'active';
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    toggleStatusMutation.mutate({ id: admin.id, status: newStatus });
  };

  const handleDeleteAdmin = (admin: Admin) => {
    if (admin.id === user?.id) {
      toast({
        title: 'Cannot delete',
        description: 'You cannot delete your own account',
        variant: 'destructive',
      });
      return;
    }
    const superadminCount = admins?.filter((a) => a.role === 'superadmin').length || 0;
    if (admin.role === 'superadmin' && superadminCount <= 1) {
      toast({
        title: 'Cannot delete',
        description: 'Cannot delete the last superadmin. Promote another admin first.',
        variant: 'destructive',
      });
      return;
    }
    if (confirm(`Are you sure you want to delete ${admin.email}? This action cannot be undone.`)) {
      deleteAdminMutation.mutate(admin.id);
    }
  };

  if (user?.role !== 'superadmin') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Admin Users</h1>
        <div className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">Loading admin users...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Admin Users</h1>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Create Admin
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin Accounts ({admins?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!admins || admins.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No admin users found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => {
                  const isCurrentUser = admin.id === user?.id;
                  const adminStatus = (admin as any).status || 'active';
                  return (
                    <TableRow key={admin.id}>
                      <TableCell className="font-medium">
                        {admin.email}
                        {isCurrentUser && <Badge className="ml-2 bg-blue-500">You</Badge>}
                      </TableCell>
                      <TableCell>
                        {admin.role === 'superadmin' ? (
                          <Badge className="bg-purple-500">
                            <ShieldAlert className="mr-1 h-3 w-3" />
                            Superadmin
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-500">
                            <Shield className="mr-1 h-3 w-3" />
                            Admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(admin.created_at)}</TableCell>
                      <TableCell>
                        {(admin as any).last_login_at
                          ? formatRelativeTime((admin as any).last_login_at)
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Badge className={adminStatus === 'active' ? 'bg-green-500' : 'bg-gray-500'}>
                          {adminStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleOpenDialog(admin)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(admin)}
                            disabled={isCurrentUser || toggleStatusMutation.isPending}
                          >
                            {adminStatus === 'active' ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteAdmin(admin)}
                            disabled={isCurrentUser || deleteAdminMutation.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAdmin ? 'Edit Admin User' : 'Create Admin User'}</DialogTitle>
            <DialogDescription>
              {editingAdmin
                ? 'Update admin user information and permissions'
                : 'Create a new admin user account'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={!!editingAdmin}
              />
              {editingAdmin && (
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              )}
            </div>
            {!editingAdmin && (
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 12 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Minimum 12 characters required</p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'admin' | 'superadmin') =>
                  setFormData({ ...formData, role: value })
                }
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (Standard access)</SelectItem>
                  <SelectItem value="superadmin">Superadmin (Full access + user management)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full Name (Optional)</Label>
              <Input
                id="full_name"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAdmin} disabled={saveAdminMutation.isPending}>
              {saveAdminMutation.isPending
                ? 'Saving...'
                : editingAdmin
                ? 'Update Admin'
                : 'Create Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
