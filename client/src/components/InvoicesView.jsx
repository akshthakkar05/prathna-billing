import React, { useState } from 'react';
import {
  Search,
  Printer,
  FileText,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye
} from 'lucide-react';

export default function InvoicesView({ invoices, onPrintInvoice, onUpdateStatus, showToast }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredInvoices = invoices.filter((inv) => {
    const matchesStatus = statusFilter === 'ALL' || inv.paymentStatus === statusFilter;
    const query = search.toLowerCase();
    const matchesSearch =
      !search ||
      inv.invoiceNumber?.toLowerCase().includes(query) ||
      inv.customer?.name?.toLowerCase().includes(query) ||
      inv.customer?.mobile?.includes(query);
    return matchesStatus && matchesSearch;
  });

  const handleStatusChange = async (invoiceId, newStatus) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update status');
      showToast(`Invoice updated to ${newStatus}`, 'success');
      onUpdateStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div>
      <div className="top-bar">
        <div className="page-header">
          <h1>Invoice Ledger</h1>
          <p>Search, review, reprint, and track customer payments</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="search-wrapper" style={{ flex: '1', minWidth: '260px' }}>
            <Search size={16} />
            <input
              type="text"
              className="form-input search-input"
              placeholder="Search by invoice number, customer name, mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Filter Status:</span>
            {['ALL', 'PAID', 'UNPAID', 'PARTIAL'].map((status) => (
              <button
                key={status}
                className={`btn btn-sm ${statusFilter === status ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="glass-card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Taxable (₹)</th>
                <th>GST (₹)</th>
                <th>Total Bill (₹)</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Update Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map((inv) => {
                  const gstTotal = Number(inv.cgstTotal || 0) + Number(inv.sgstTotal || 0);
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {inv.invoiceNumber}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{inv.customer?.name}</div>
                        {inv.customer?.mobile && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {inv.customer.mobile}
                          </div>
                        )}
                      </td>
                      <td>₹{Number(inv.taxableTotal).toFixed(2)}</td>
                      <td style={{ color: 'var(--emerald)' }}>₹{gstTotal.toFixed(2)}</td>
                      <td style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                        ₹{Number(inv.billAmount).toFixed(2)}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {inv.paymentMethod || 'CASH'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            inv.paymentStatus === 'PAID'
                              ? 'badge-paid'
                              : inv.paymentStatus === 'PARTIAL'
                              ? 'badge-partial'
                              : 'badge-unpaid'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          value={inv.paymentStatus}
                          onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                          style={{ padding: '4px 8px', fontSize: '0.78rem', width: '105px' }}
                        >
                          <option value="PAID">PAID</option>
                          <option value="PARTIAL">PARTIAL</option>
                          <option value="UNPAID">UNPAID</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onPrintInvoice(inv)}
                          title="Print / View Invoice"
                        >
                          <Printer size={15} /> Print
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                    No invoices match your search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
