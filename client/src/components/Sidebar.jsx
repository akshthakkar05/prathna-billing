import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Package,
  Users,
  ArrowLeftRight,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

export default function Sidebar({ currentTab, setCurrentTab, lowStockCount }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pos', label: 'New Invoice (POS)', icon: Receipt, highlight: true },
    { id: 'invoices', label: 'Invoices History', icon: FileText },
    { id: 'inventory', label: 'Inventory / Products', icon: Package, badge: lowStockCount > 0 ? lowStockCount : null },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'stock', label: 'Stock Ledger', icon: ArrowLeftRight },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <div className="brand-title">PRATHNA</div>
          <div className="brand-subtitle">GST Billing & ERP</div>
        </div>
      </div>

      <ul className="nav-links">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <li
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setCurrentTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.badge && (
                <span className="nav-badge" title="Low stock items">
                  {item.badge}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sidebar-footer">
        <div className="user-avatar">PA</div>
        <div className="user-info">
          <span className="user-name">Prathna Admin</span>
          <span className="user-role">Administrator</span>
        </div>
      </div>
    </aside>
  );
}
