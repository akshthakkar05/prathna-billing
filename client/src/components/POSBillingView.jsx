import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Printer,
  Search,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Receipt,
  IndianRupee,
  ShoppingBag
} from 'lucide-react';

export default function POSBillingView({
  products,
  customers,
  onInvoiceCreated,
  onOpenCustomerModal,
  showToast,
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('INV-1001');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('PAID');
  const [paymentMethod, setPaymentMethod] = useState('UPI');

  // Line items state
  const [items, setItems] = useState([]);

  // Selected product picker state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [pickerQty, setPickerQty] = useState(1);
  const [pickerRate, setPickerRate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch next invoice number
  useEffect(() => {
    fetch('/api/invoices/next-number')
      .then((res) => res.json())
      .then((data) => {
        if (data.nextInvoiceNumber) {
          setInvoiceNumber(data.nextInvoiceNumber);
        }
      })
      .catch((err) => console.error('Error fetching next invoice number:', err));

    if (customers && customers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers]);

  // When a product is selected in dropdown, update rate
  const handleProductSelect = (productId) => {
    setSelectedProductId(productId);
    const prod = products.find((p) => p.id === productId);
    if (prod) {
      setPickerRate(prod.sellingPrice);
    }
  };

  // Add line item
  const handleAddItem = (e) => {
    e?.preventDefault();
    if (!selectedProductId) {
      showToast('Please select a product first', 'error');
      return;
    }

    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const qty = Number(pickerQty);
    if (isNaN(qty) || qty <= 0) {
      showToast('Please enter a valid quantity', 'error');
      return;
    }

    const rate = Number(pickerRate) || Number(prod.sellingPrice);
    const gstRate = Number(prod.gstRate);

    // Check if item is already added; if so, update qty
    const existingIndex = items.findIndex((i) => i.productId === prod.id);

    if (existingIndex > -1) {
      const updated = [...items];
      updated[existingIndex].qty += qty;
      const tVal = Number((updated[existingIndex].qty * updated[existingIndex].rate).toFixed(2));
      const cgst = Number(((tVal * (gstRate / 2)) / 100).toFixed(2));
      const sgst = Number(((tVal * (gstRate / 2)) / 100).toFixed(2));
      updated[existingIndex].taxableValue = tVal;
      updated[existingIndex].cgstAmount = cgst;
      updated[existingIndex].sgstAmount = sgst;
      updated[existingIndex].amount = Number((tVal + cgst + sgst).toFixed(2));
      setItems(updated);
    } else {
      const taxableValue = Number((qty * rate).toFixed(2));
      const cgstAmount = Number(((taxableValue * (gstRate / 2)) / 100).toFixed(2));
      const sgstAmount = Number(((taxableValue * (gstRate / 2)) / 100).toFixed(2));
      const amount = Number((taxableValue + cgstAmount + sgstAmount).toFixed(2));

      setItems([
        ...items,
        {
          productId: prod.id,
          product: prod,
          descriptionSnapshot: prod.name,
          hsnSnapshot: prod.hsnCode,
          gstRateSnapshot: gstRate,
          qty,
          rate,
          taxableValue,
          cgstAmount,
          sgstAmount,
          amount,
        },
      ]);
    }

    // Reset picker
    setSelectedProductId('');
    setPickerQty(1);
    setPickerRate('');
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItemQty = (index, newQty) => {
    const qty = Number(newQty);
    if (isNaN(qty) || qty <= 0) return;

    const updated = [...items];
    const item = updated[index];
    const gstRate = Number(item.gstRateSnapshot);
    const taxableValue = Number((qty * item.rate).toFixed(2));
    const cgstAmount = Number(((taxableValue * (gstRate / 2)) / 100).toFixed(2));
    const sgstAmount = Number(((taxableValue * (gstRate / 2)) / 100).toFixed(2));
    const amount = Number((taxableValue + cgstAmount + sgstAmount).toFixed(2));

    updated[index] = {
      ...item,
      qty,
      taxableValue,
      cgstAmount,
      sgstAmount,
      amount,
    };
    setItems(updated);
  };

  // Calculate live bill totals
  const taxableTotal = items.reduce((sum, item) => sum + item.taxableValue, 0);
  const cgstTotal = items.reduce((sum, item) => sum + item.cgstAmount, 0);
  const sgstTotal = items.reduce((sum, item) => sum + item.sgstAmount, 0);
  const rawTotal = taxableTotal + cgstTotal + sgstTotal;
  const grandTotal = Math.round(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));

  // Submit invoice
  const handleSubmitInvoice = async () => {
    if (!selectedCustomerId) {
      showToast('Please select a customer for this invoice', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('Please add at least one line item to the invoice', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        invoiceNumber,
        invoiceDate,
        customerId: selectedCustomerId,
        paymentStatus,
        paymentMethod,
        items: items.map((i) => ({
          productId: i.productId,
          descriptionSnapshot: i.descriptionSnapshot,
          qty: i.qty,
          rate: i.rate,
        })),
      };

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create invoice');
      }

      const createdInvoice = await res.json();
      showToast(`Invoice ${createdInvoice.invoiceNumber} created successfully!`, 'success');

      // Clear current form
      setItems([]);
      // Callback to parent to open print preview modal and refresh state
      onInvoiceCreated(createdInvoice);
    } catch (error) {
      console.error(error);
      showToast(error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div>
      <div className="top-bar">
        <div className="page-header">
          <h1>GST Billing Terminal</h1>
          <p>Instant tax invoice generator with automated stock ledger and GST computation</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={onOpenCustomerModal}>
            <UserPlus size={16} /> New Customer
          </button>
        </div>
      </div>

      <div className="billing-layout">
        {/* Left Column: Invoice Details & Items Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Metadata Section (Customer, Invoice #, Date) */}
          <div className="glass-card">
            <div className="form-grid">
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Customer *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    className="form-select"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.mobile ? `(${c.mobile})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Invoice Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-1001"
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Invoice Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Add Product Item Box */}
          <div className="glass-card" style={{ border: '1px solid var(--border-focus)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingBag size={18} style={{ color: 'var(--primary)' }} /> Select Product to Add
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Product</label>
                <select
                  className="form-select"
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                >
                  <option value="">-- Choose Item from Inventory --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock: {Number(p.currentStock)} {p.unit}) - ₹{Number(p.sellingPrice)} + {Number(p.gstRate)}% GST
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Unit Rate (₹ excl. GST)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={pickerRate}
                  onChange={(e) => setPickerRate(e.target.value)}
                  placeholder="Rate"
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Qty</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={pickerQty}
                  onChange={(e) => setPickerQty(e.target.value)}
                />
              </div>

              <button className="btn btn-primary" onClick={handleAddItem} style={{ height: '42px' }}>
                <Plus size={16} /> Add Item
              </button>
            </div>

            {selectedProduct && (
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>HSN: <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct.hsnCode}</strong></span>
                <span>GST: <strong style={{ color: 'var(--emerald)' }}>{Number(selectedProduct.gstRate)}%</strong></span>
                <span>Available Stock: <strong style={{ color: Number(selectedProduct.currentStock) <= Number(selectedProduct.minStockLevel) ? 'var(--rose)' : 'var(--emerald)' }}>{Number(selectedProduct.currentStock)} {selectedProduct.unit}</strong></span>
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="glass-card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '14px' }}>
              Invoice Items ({items.length})
            </h3>

            <div className="table-container">
              <table className="data-table billing-items-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product Description</th>
                    <th>HSN</th>
                    <th>Rate</th>
                    <th>Qty</th>
                    <th>Taxable</th>
                    <th>GST</th>
                    <th>Total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length > 0 ? (
                    items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{item.descriptionSnapshot}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{item.hsnSnapshot}</td>
                        <td>₹{Number(item.rate).toFixed(2)}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleUpdateItemQty(idx, e.target.value)}
                            style={{
                              width: '64px',
                              padding: '4px 6px',
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              color: 'white',
                              textAlign: 'center',
                            }}
                          />
                        </td>
                        <td>₹{item.taxableValue.toFixed(2)}</td>
                        <td style={{ fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--emerald)' }}>₹{(item.cgstAmount + item.sgstAmount).toFixed(2)}</span>
                          <span style={{ color: 'var(--text-muted)' }}> ({item.gstRateSnapshot}%)</span>
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          ₹{item.amount.toFixed(2)}
                        </td>
                        <td>
                          <button
                            className="btn btn-danger btn-sm"
                            style={{ padding: '4px 6px' }}
                            onClick={() => handleRemoveItem(idx)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>
                        No items added yet. Select a product above to add to this invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Bill Summary & Checkout */}
        <div>
          <div className="glass-card pos-summary-card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              Payment & Summary
            </h3>

            {/* Payment Options */}
            <div className="form-group">
              <label className="form-label">Payment Status</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                {['PAID', 'PARTIAL', 'UNPAID'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`btn btn-sm ${paymentStatus === status ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setPaymentStatus(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select
                className="form-select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="UPI">UPI / QR Code</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card / POS Machine</option>
                <option value="CREDIT">Store Credit (Khata)</option>
              </select>
            </div>

            {/* Calculations Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              <div className="summary-row">
                <span>Taxable Amount</span>
                <span>₹{taxableTotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>CGST</span>
                <span>₹{cgstTotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>SGST</span>
                <span>₹{sgstTotal.toFixed(2)}</span>
              </div>
              {roundOff !== 0 && (
                <div className="summary-row">
                  <span>Round Off</span>
                  <span>₹{roundOff.toFixed(2)}</span>
                </div>
              )}
              <div className="summary-row total">
                <span>Grand Total</span>
                <span style={{ color: 'var(--emerald)' }}>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn btn-emerald"
                style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
                onClick={handleSubmitInvoice}
                disabled={submitting || items.length === 0}
              >
                <Printer size={18} />
                {submitting ? 'Generating Invoice...' : 'Generate & Print Invoice'}
              </button>

              <button
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => setItems([])}
                disabled={items.length === 0}
              >
                Clear All Items
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
