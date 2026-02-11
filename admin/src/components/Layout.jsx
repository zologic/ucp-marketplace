import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getCurrentUser, logout } from '../api/client.js';

function Layout({ children }) {
  const location = useLocation();
  const user = getCurrentUser();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/merchants', label: 'Merchants', icon: '🏪' },
    { path: '/analytics', label: 'Analytics', icon: '📈' },
    { path: '/billing', label: 'Billing', icon: '💳' },
    { path: '/tenants', label: 'Tenants', icon: '🏢' },
    { path: '/admin-users', label: 'Admin Users', icon: '👥' },
    { path: '/audit-logs', label: 'Audit Logs', icon: '📝' },
    { path: '/system-health', label: 'System Health', icon: '🏥' }
  ];

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          🛒 UCP Marketplace
        </div>
        <nav>
          <ul className="sidebar-nav">
            {navItems.map((item) => (
              <li key={item.path} className="sidebar-nav-item">
                <Link
                  to={item.path}
                  className={`sidebar-nav-link ${isActive(item.path) ? 'active' : ''}`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div></div>
          <div className="topbar-user">
            <span className="topbar-user-email">{user?.email}</span>
            <button onClick={logout} className="btn btn-outline btn-sm">
              Logout
            </button>
          </div>
        </header>

        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
