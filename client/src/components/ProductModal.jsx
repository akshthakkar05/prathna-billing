import React, { useState, useEffect } from 'react';
import { X, Save, Package } from 'lucide-react';

export default function ProductModal({ product, onClose, onSave, showToast }) {
  const isEditing = Boolean(product && product.id);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    hsnCode: '',
    gstRate: '18.00',
    purchasePrice: '',
    sellingPrice: '',
    currentStock: '0',
    minStockLevel: '5',
    unit: 'PCS',
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        sku: product.sku || '',
        hsnCode: product.hsnCode || '',
        gstRate: String(product.gstRate || '18.00'),
        purchasePrice: String(product.purchasePrice || ''),
        sellingPrice: String(product.sellingPrice || ''),
        currentStock: String(product.currentStock || '0'),
        minStockLevel: String(product.minStockLevel || '5'),
        unit: product.unit || 'PCS',
      });
    }
  }, [product]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.hsnCode || !formData.sellingPrice || !formData.purchasePrice) {
      showToast('Please fill all mandatory fields (Name, HSN, Purchase & Selling Price)', 'error');
      return;
    }

    try {
      const url = isEditing ? `/api/products/${product.id}` : '/api/products';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save product');
      }

      showToast(`Product ${isEditing ? 'updated' : 'created'} successfully!`, 'success');
      onSave();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{isEditing ? 'Edit Product' : 'Add New Product'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Havells 15W LED Bulb"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">SKU / Item Code</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. BLB-15W-W"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">HSN Code *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 9405"
                  value={formData.hsnCode}
                  onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">GST Rate (%) *</label>
                <select
                  className="form-select"
                  value={formData.gstRate}
                  onChange={(e) => setFormData({ ...formData, gstRate: e.target.value })}
                >
                  <option value="0.00">0% (Nil)</option>
                  <option value="5.00">5%</option>
                  <option value="12.00">12%</option>
                  <option value="18.00">18% (Standard)</option>
                  <option value="28.00">28%</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Unit of Measure</label>
                <select
                  className="form-select"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                >
                  <option value="PCS">PCS (Pieces)</option>
                  <option value="ROLL">ROLL</option>
                  <option value="BOX">BOX</option>
                  <option value="MTR">MTR (Meters)</option>
                  <option value="KG">KG (Kilograms)</option>
                  <option value="SET">SET</option>
                </select>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Purchase Price (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  placeholder="0.00"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Selling Price (₹ excl. GST) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  placeholder="0.00"
                  value={formData.sellingPrice}
                  onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              {!isEditing && (
                <div className="form-group">
                  <label className="form-label">Initial Opening Stock</label>
                  <input
                    type="number"
                    step="1"
                    className="form-input"
                    placeholder="0"
                    value={formData.currentStock}
                    onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Min Stock Alert Level</label>
                <input
                  type="number"
                  step="1"
                  className="form-input"
                  placeholder="5"
                  value={formData.minStockLevel}
                  onChange={(e) => setFormData({ ...formData, minStockLevel: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Save size={16} /> {isEditing ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
