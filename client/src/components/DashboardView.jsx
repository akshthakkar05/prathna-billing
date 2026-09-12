import React from 'react';
import {
  TrendingUp,
  IndianRupee,
  Clock,
  AlertTriangle,
  Package,
  PlusCircle,
  FileText,
  CheckCircle2,
  ArrowRight,
  Receipt
} from 'lucide-react';

export default function DashboardView({ stats, onNavigate, onPrintInvoice, onOpenRestock }) {
  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
        Loading dashboard analytics...
      </div>
    );
  }

  return (
    <div>
      <div className="top-bar">
        <div className="page-header">
          <h1>Business Overview</h1>
          <p>Real-time analytics, daily revenue tracking, and inventory status</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => onNavigate('pos')}>
            <Receipt size={16} /> New GST Invoice
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('inventory')}>
            <Package size={16} /> Products
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="glass-card stat-card" style={{ '--accent-glow': 'rgba(99, 102, 241, 0.25)' }}>
          <div className="stat-header">
            <span className="stat-title">Total Revenue</span>
            <div className="stat-icon-wrapper" style={{ color: 'var(--primary)' }}>
              <IndianRupee size={18} />
            </div>
          </div>
          <div className="stat-value">₹{stats.totalSales?.toLocaleString('en-IN') || '0'}</div>
          <div className="stat-subtext">
            <TrendingUp size={14} style={{ color: 'var(--emerald)' }} />
            <span>Across {stats.totalInvoices || 0} invoices</span>
          </div>
        </div>

        <div className="glass-card stat-card" style={{ '--accent-glow': 'rgba(16, 185, 129, 0.25)' }}>
          <div className="stat-header">
            <span className="stat-title">Today's Sales</span>
            <div className="stat-icon-wrapper" style={{ color: 'var(--emerald)' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: 'var(--emerald)' }}>
            ₹{stats.todaySales?.toLocaleString('en-IN') || '0'}
          </div>
          <div className="stat-subtext">
            <span>Generated today</span>
          </div>
        </div>

        <div className="glass-card stat-card" style={{ '--accent-glow': 'rgba(244, 63, 94, 0.25)' }}>
          <div className="stat-header">
            <span className="stat-title">Pending Payment</span>
            <div className="stat-icon-wrapper" style={{ color: 'var(--rose)' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: 'var(--rose)' }}>
            ₹{stats.unpaidAmount?.toLocaleString('en-IN') || '0'}
          </div>
          <div className="stat-subtext">
            <span>{stats.unpaidCount || 0} unpaid invoices</span>
          </div>
        </div>

        <div className="glass-card stat-card" style={{ '--accent-glow': 'rgba(245, 158, 11, 0.25)' }}>
          <div className="stat-header">
            <span className="stat-title">Low Stock Alert</span>
            <div className="stat-icon-wrapper" style={{ color: 'var(--amber)' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: stats.lowStockCount > 0 ? 'var(--amber)' : 'var(--emerald)' }}>
            {stats.lowStockCount || 0}
          </div>
          <div className="stat-subtext">
            <span>{stats.lowStockCount > 0 ? 'Action required immediately' : 'Inventory healthy'}</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout for Low Stock & Recent Invoices */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        {/* Recent Invoices Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>Recent Invoices</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('invoices')}>
              View All <ArrowRight size={14} />
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentInvoices?.length > 0 ? (
                  stats.recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{inv.invoiceNumber}</td>
                      <td>{inv.customer?.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                      <td style={{ fontWeight: 600 }}>₹{Number(inv.billAmount).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${
                          inv.paymentStatus === 'PAID' ? 'badge-paid' :
                          inv.paymentStatus === 'PARTIAL' ? 'badge-partial' : 'badge-unpaid'
                        }`}>
                          {inv.paymentStatus}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={() => onPrintInvoice(inv)}
                          title="Print / View"
                        >
                          <FileText size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                      No invoices created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Items Alert Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} style={{ color: 'var(--amber)' }} /> Stock Warnings
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('inventory')}>
              Manage Stock
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Current</th>
                  <th>Min</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stats.lowStockProducts?.length > 0 ? (
                  stats.lowStockProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: {p.sku || 'N/A'}</div>
                      </td>
                      <td style={{ color: 'var(--rose)', fontWeight: 700 }}>
                        {Number(p.currentStock)} {p.unit}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{Number(p.minStockLevel)}</td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ padding: '4px 10px' }}
                          onClick={() => onOpenRestock(p)}
                        >
                          Restock
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--emerald)', padding: '24px' }}>
                      ✓ All product stock levels are above threshold!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
