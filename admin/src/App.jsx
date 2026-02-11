import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Merchants from './pages/Merchants.jsx';
import Analytics from './pages/Analytics.jsx';
import Billing from './pages/Billing.jsx';
import Tenants from './pages/Tenants.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import SystemHealth from './pages/SystemHealth.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/merchants" element={<Merchants />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/tenants" element={<Tenants />} />
                <Route path="/admin-users" element={<AdminUsers />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
                <Route path="/system-health" element={<SystemHealth />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
