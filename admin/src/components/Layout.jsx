import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getCurrentUser, logout } from '../api/client.js';

function Layout({ children }) {
  const location = useLocation();
  const user = getCurrentUser();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: 'fa-gauge-high' },
    { path: '/merchants', label: 'Merchants', icon: 'fa-shop' },
    { path: '/analytics', label: 'Analytics', icon: 'fa-chart-line' },
    { path: '/billing', label: 'Billing', icon: 'fa-file-invoice-dollar' },
    { path: '/tenants', label: 'Tenants', icon: 'fa-building-user' },
    { path: '/admin-users', label: 'Admin Users', icon: 'fa-user-shield' },
    { path: '/audit-logs', label: 'Audit Logs', icon: 'fa-clipboard-list' },
    { path: '/system-health', label: 'System Health', icon: 'fa-heart-pulse' }
  ];

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const getInitials = (email) => {
    if (!email) return 'A';
    return email.charAt(0).toUpperCase();
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link to="/" className="sidebar-logo">
            <i className="fas fa-cart-shopping"></i>
            <span>UCP Marketplace</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
            >
              <i className={`fas ${item.icon}`}></i>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {getInitials(user?.email)}
            </div>
            <div className="user-details">
              <span className="user-email">{user?.email || 'admin@example.com'}</span>
            </div>
          </div>
          <button onClick={logout} className="btn btn-secondary btn-sm w-full">
            <i className="fas fa-right-from-bracket"></i>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="main-content">
        {children}
      </div>
    </div>
  );
}

export default Layout;
