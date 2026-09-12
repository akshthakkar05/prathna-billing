import React, { useState } from 'react';
import {
  PackagePlus,
  Search,
  AlertTriangle,
  ArrowUpDown,
  Edit2,
  CheckCircle,
  TrendingDown
} from 'lucide-react';

export default function InventoryView({
  products,
  onOpenProductModal,
  onOpenRestockModal,
  onRefresh,
}) {
  const [search, setSearch] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);

  const filteredProducts = products.filter((p) => {
    const isLow = Number(p.currentStock) <= Number(p.minStockLevel);
    if (filterLowStock && !isLow) return false;

    const query = search.toLowerCase();
    return (
      !search ||
      p.name?.toLowerCase().includes(query) ||
      p.sku?.toLowerCase().includes(query) ||
      p.hsnCode?.toLowerCase().includes(query)
    );
  });

  return (
    <div>
      <div className="top-bar">
        <div className="page-header">
          <h1>Product Catalog & Stock</h1>
          <p>Manage product pricing, GST rates, HSN codes, and inventory levels</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => onOpenProductModal()}>
            <PackagePlus size={16} /> Add Product
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="search-wrapper" style={{ flex: '1', minWidth: '260px' }}>
            <Search size={16} />
            <input
              type="text"
              className="form-input search-input"
              placeholder="Search products by title, SKU, or HSN code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            className={`btn btn-sm ${filterLowStock ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => setFilterLowStock(!filterLowStock)}
          >
            <AlertTriangle size={15} />
            {filterLowStock ? 'Showing Low Stock Only' : 'Filter Low Stock'}
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="glass-card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>SKU</th>
                <th>HSN</th>
                <th>GST Rate</th>
                <th>Purchase (₹)</th>
                <th>Selling (₹)</th>
                <th>Current Stock</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((p) => {
                  const isLow = Number(p.currentStock) <= Number(p.minStockLevel);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Min Threshold: {Number(p.minStockLevel)} {p.unit}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {p.sku || '—'}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.hsnCode}</td>
                      <td>
                        <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>
                          {Number(p.gstRate)}%
                        </span>
                      </td>
                      <td>₹{Number(p.purchasePrice).toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        ₹{Number(p.sellingPrice).toFixed(2)}
                      </td>
                      <td>
                        <strong style={{ fontSize: '0.95rem', color: isLow ? 'var(--rose)' : 'var(--text-primary)' }}>
                          {Number(p.currentStock)}
                        </strong>{' '}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.unit}</span>
                      </td>
                      <td>
                        <span className={`badge ${isLow ? 'badge-low-stock' : 'badge-in-stock'}`}>
                          {isLow ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => onOpenRestockModal(p)}
                            title="Adjust / Restock"
                          >
                            <ArrowUpDown size={14} /> Restock
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => onOpenProductModal(p)}
                            title="Edit Product"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                    No products found.
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
