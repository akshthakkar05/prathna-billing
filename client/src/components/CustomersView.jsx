import React, { useState } from 'react';
import { UserPlus, Search, Phone, MapPin, Building, FileText } from 'lucide-react';

export default function CustomersView({ customers, onOpenCustomerModal, onNavigate }) {
  const [search, setSearch] = useState('');

  const filteredCustomers = customers.filter((c) => {
    const query = search.toLowerCase();
    return (
      !search ||
      c.name?.toLowerCase().includes(query) ||
      c.mobile?.toLowerCase().includes(query) ||
      c.gstin?.toLowerCase().includes(query)
    );
  });

  return (
    <div>
      <div className="top-bar">
        <div className="page-header">
          <h1>Customer Directory</h1>
          <p>Maintain trade parties, customer contacts, and GSTIN compliance</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => onOpenCustomerModal()}>
            <UserPlus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <div className="search-wrapper">
          <Search size={16} />
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search customers by name, phone number, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="glass-card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer / Trade Name</th>
                <th>Contact Phone</th>
                <th>GSTIN</th>
                <th>Billing Address</th>
                <th>Total Invoices</th>
                <th>Registered Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                    </td>
                    <td>
                      {c.mobile ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Phone size={14} style={{ color: 'var(--primary)' }} />
                          <span>{c.mobile}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {c.gstin ? (
                        <span style={{ fontFamily: 'monospace', color: 'var(--emerald)', fontWeight: 600 }}>
                          {c.gstin}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Unregistered</span>
                      )}
                    </td>
                    <td>
                      {c.address ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '300px' }}>
                          <MapPin size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            {c.address}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)' }}>
                        <FileText size={12} /> {c._count?.invoices || 0} Bills
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(c.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                    No customers found matching your criteria.
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
