import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, TrendingUp, TrendingDown, RefreshCw, Filter } from 'lucide-react';

export default function StockLedgerView() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const url = typeFilter === 'ALL' ? '/api/stock' : `/api/stock?type=${typeFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load stock ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [typeFilter]);

  return (
    <div>
      <div className="top-bar">
        <div className="page-header">
          <h1>Stock Movement Ledger</h1>
          <p>Complete audit trail of inward purchases, invoice sales deductions, and inventory adjustments</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={fetchTransactions}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Filter size={15} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Movement Type:</span>
          {['ALL', 'PURCHASE', 'SALE', 'ADJUSTMENT'].map((type) => (
            <button
              key={type}
              className={`btn btn-sm ${typeFilter === type ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTypeFilter(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="glass-card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Product</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Loading stock transactions...
                  </td>
                </tr>
              ) : transactions.length > 0 ? (
                transactions.map((tx) => {
                  const isPositive = Number(tx.quantity) > 0;
                  return (
                    <tr key={tx.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {new Date(tx.createdAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{tx.product?.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          SKU: {tx.product?.sku || 'N/A'}
                        </div>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background:
                              tx.type === 'PURCHASE'
                                ? 'var(--emerald-glow)'
                                : tx.type === 'SALE'
                                ? 'var(--primary-glow)'
                                : 'var(--amber-glow)',
                            color:
                              tx.type === 'PURCHASE'
                                ? 'var(--emerald)'
                                : tx.type === 'SALE'
                                ? 'var(--primary)'
                                : 'var(--amber)',
                          }}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 700,
                            color: isPositive ? 'var(--emerald)' : 'var(--rose)',
                          }}
                        >
                          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {isPositive ? `+${Number(tx.quantity)}` : `${Number(tx.quantity)}`}{' '}
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {tx.product?.unit || 'PCS'}
                          </span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {tx.reference || '—'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                    No stock transactions recorded yet.
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
