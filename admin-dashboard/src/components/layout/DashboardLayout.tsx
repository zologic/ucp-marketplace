import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Store,
  Building2,
  BarChart3,
  Receipt,
  FileText,
  Activity,
  Users,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Merchants', href: '/merchants', icon: Store },
  { name: 'Tenants', href: '/tenants', icon: Building2 },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Billing', href: '/billing', icon: Receipt },
  { name: 'Audit Logs', href: '/audit-logs', icon: FileText },
  { name: 'System Health', href: '/system-health', icon: Activity },
  { name: 'Admin Users', href: '/admin-users', icon: Users, superadminOnly: true },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const filteredNavigation = navigation.filter(
    (item) => !item.superadminOnly || user?.role === 'superadmin'
  );

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-primary">UCPReady</h1>
          <p className="text-sm text-muted-foreground">Admin Dashboard</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {filteredNavigation.map((item) => {
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info and logout */}
        <div className="p-4 border-t">
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-900">{user?.email}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {navigation.find((item) => location.pathname.startsWith(item.href))?.name || 'Dashboard'}
          </h2>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
