import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import DashboardLayout from '@/components/layout/DashboardLayout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="merchants" element={<div className="text-center py-12 text-muted-foreground">Merchants page - to be implemented</div>} />
        <Route path="tenants" element={<div className="text-center py-12 text-muted-foreground">Tenants page - to be implemented</div>} />
        <Route path="analytics" element={<div className="text-center py-12 text-muted-foreground">Analytics page - to be implemented</div>} />
        <Route path="billing" element={<div className="text-center py-12 text-muted-foreground">Billing page - to be implemented</div>} />
        <Route path="audit-logs" element={<div className="text-center py-12 text-muted-foreground">Audit Logs page - to be implemented</div>} />
        <Route path="system-health" element={<div className="text-center py-12 text-muted-foreground">System Health page - to be implemented</div>} />
        <Route path="admin-users" element={<div className="text-center py-12 text-muted-foreground">Admin Users page - to be implemented</div>} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
