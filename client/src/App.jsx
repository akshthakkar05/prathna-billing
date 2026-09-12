import React, { useState, useEffect } from 'react';
import {
  Package,
  UserPlus,
  Receipt,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Code2,
  RefreshCw,
  Search,
  Truck,
  Building2,
  Settings,
  Download,
  FileDown
} from 'lucide-react';

export default function App() {
  // Navigation tabs: 'invoice' | 'product' | 'customer' | 'purchase' | 'supplier' | 'settings'
  const [activeTab, setActiveTab] = useState('invoice');

  // Core collections
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [companySettings, setCompanySettings] = useState({
    name: 'Prathna Enterprises',
    address: '42, Industrial Estate, Phase-1, Ahmedabad, Gujarat - 380015',
    phone: '+91 98765 43210',
    gstin: '24AAACP9988P1Z8',
    pan: 'AAACP9988P',
    terms: '1. Goods once sold will not be taken back.\n2. Subject to Ahmedabad jurisdiction.',
  });

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [toast, setToast] = useState(null);

  // Form: Create Product
  const [productForm, setProductForm] = useState({
    name: '',
    hsnCode: '',
    gstRate: '18.00',
    purchasePrice: '',
    sellingPrice: '',
    openingStock: '10',
  });
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Form: Create Customer
  const [customerForm, setCustomerForm] = useState({
    name: '',
    mobile: '',
    address: '',
    gstin: '',
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Form: Create Supplier (Slice 2)
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    mobile: '',
    address: '',
    gstin: '',
    pan: '',
    notes: '',
  });
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  // Form: Create Purchase (Slice 2)
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [purchaseRefNumber, setPurchaseRefNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [purchaseProdId, setPurchaseProdId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('10');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [creatingPurchase, setCreatingPurchase] = useState(false);

  // Form: Create Invoice
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [savedInvoiceJSON, setSavedInvoiceJSON] = useState(null);

  // Settings saving state
  const [savingSettings, setSavingSettings] = useState(false);

  // Invoice ID lookup tester for GET /invoices/:id
  const [lookupInvoiceId, setLookupInvoiceId] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load all initial data from server
  const loadData = async () => {
    try {
      const [pRes, cRes, sRes, puRes, setRes] = await Promise.all([
        fetch('/products'),
        fetch('/customers'),
        fetch('/suppliers'),
        fetch('/purchases'),
        fetch('/settings'),
      ]);

      const [pData, cData, sData, puData, setData] = await Promise.all([
        pRes.json(),
        cRes.json(),
        sRes.json(),
        puRes.json(),
        setRes.json(),
      ]);

      setProducts(Array.isArray(pData) ? pData : []);
      setCustomers(Array.isArray(cData) ? cData : []);
      setSuppliers(Array.isArray(sData) ? sData : []);
      setPurchases(Array.isArray(puData) ? puData : []);
      if (setData && !setData.error) setCompanySettings(setData);

      if (Array.isArray(cData) && cData.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(cData[0].id);
      }
      if (Array.isArray(sData) && sData.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(sData[0].id);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
      showToast('Failed to load server data', 'error');
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- Handlers: Product ---
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!productForm.name || !productForm.hsnCode || !productForm.purchasePrice || !productForm.sellingPrice) {
      showToast('Please fill all required product fields', 'error');
      return;
    }

    setCreatingProduct(true);
    try {
      const res = await fetch('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create product');

      showToast(`Product "${data.name}" created with ${data.currentStock} units stock!`, 'success');
      setProductForm({
        name: '',
        hsnCode: '',
        gstRate: '18.00',
        purchasePrice: '',
        sellingPrice: '',
        openingStock: '10',
      });
      await loadData();
      setActiveTab('invoice');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingProduct(false);
    }
  };

  // --- Handlers: Customer ---
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.name) {
      showToast('Customer name is required', 'error');
      return;
    }

    setCreatingCustomer(true);
    try {
      const res = await fetch('/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create customer');

      showToast(`Customer "${data.name}" created successfully!`, 'success');
      setCustomerForm({ name: '', mobile: '', address: '', gstin: '' });
      await loadData();
      setSelectedCustomerId(data.id);
      setActiveTab('invoice');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingCustomer(false);
    }
  };

  // --- Handlers: Supplier (Slice 2) ---
  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name) {
      showToast('Supplier name is required', 'error');
      return;
    }

    setCreatingSupplier(true);
    try {
      const res = await fetch('/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create supplier');

      showToast(`Supplier "${data.name}" added successfully!`, 'success');
      setSupplierForm({ name: '', mobile: '', address: '', gstin: '', pan: '', notes: '' });
      await loadData();
      setSelectedSupplierId(data.id);
      setActiveTab('purchase');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingSupplier(false);
    }
  };

  // --- Handlers: Purchase (Slice 2) ---
  const handleAddPurchaseItem = () => {
    if (!purchaseProdId) {
      showToast('Please select a product for the purchase line', 'error');
      return;
    }
    const prod = products.find((p) => p.id === purchaseProdId);
    if (!prod) return;

    const qty = parseFloat(purchaseQty);
    const rate = purchaseRate !== '' ? parseFloat(purchaseRate) : Number(prod.purchasePrice);
    if (isNaN(qty) || qty <= 0 || isNaN(rate) || rate < 0) {
      showToast('Please enter valid quantity and rate', 'error');
      return;
    }

    const gstRate = Number(prod.gstRate);
    const taxable = Number((qty * rate).toFixed(2));
    const gstAmt = Number(((taxable * gstRate) / 100).toFixed(2));
    const total = Number((taxable + gstAmt).toFixed(2));

    setPurchaseItems([
      ...purchaseItems,
      {
        productId: prod.id,
        name: prod.name,
        hsnCode: prod.hsnCode,
        qty,
        rate,
        gstRate,
        taxable,
        gstAmt,
        total,
      },
    ]);

    setPurchaseProdId('');
    setPurchaseQty('10');
    setPurchaseRate('');
  };

  const handleSavePurchase = async () => {
    if (!selectedSupplierId) {
      showToast('Please select a supplier', 'error');
      return;
    }
    if (!purchaseRefNumber.trim()) {
      showToast('Please enter supplier invoice / reference number', 'error');
      return;
    }
    if (purchaseItems.length === 0) {
      showToast('Please add at least one product item to purchase', 'error');
      return;
    }

    setCreatingPurchase(true);
    try {
      const payload = {
        supplierId: selectedSupplierId,
        referenceNumber: purchaseRefNumber.trim(),
        purchaseDate,
        items: purchaseItems.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          rate: item.rate,
          gstRate: item.gstRate,
        })),
      };

      const res = await fetch('/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save purchase');

      showToast(`Purchase "${data.referenceNumber}" saved and stock increased!`, 'success');
      setPurchaseItems([]);
      setPurchaseRefNumber('');
      await loadData(); // refresh product stock
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingPurchase(false);
    }
  };

  // --- Handlers: Settings (Slice 2) ---
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companySettings),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      setCompanySettings(data);
      showToast('Company settings updated successfully!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // --- Handlers: Invoice ---
  const handleAddItemToInvoice = () => {
    if (!selectedProductId) {
      showToast('Please choose a product from the list', 'error');
      return;
    }

    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const qtyNum = parseFloat(itemQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      showToast('Please enter a valid positive quantity', 'error');
      return;
    }

    const existingIndex = invoiceItems.findIndex((i) => i.productId === prod.id);
    if (existingIndex > -1) {
      const updated = [...invoiceItems];
      updated[existingIndex].qty += qtyNum;
      setInvoiceItems(updated);
    } else {
      setInvoiceItems([
        ...invoiceItems,
        {
          productId: prod.id,
          name: prod.name,
          hsnCode: prod.hsnCode,
          gstRate: prod.gstRate,
          sellingPrice: prod.sellingPrice,
          currentStock: prod.currentStock,
          unit: prod.unit,
          qty: qtyNum,
        },
      ]);
    }

    setSelectedProductId('');
    setItemQty('1');
  };

  const handleRemoveInvoiceItem = (index) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  // Live client-side total preview (matches server Decimal calculation)
  const calculateLiveTotals = () => {
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;

    for (const item of invoiceItems) {
      const lineTaxable = Number((item.qty * Number(item.sellingPrice)).toFixed(2));
      const halfRate = Number(item.gstRate) / 2;
      const lineCgst = Number(((lineTaxable * halfRate) / 100).toFixed(2));
      const lineSgst = Number(((lineTaxable * halfRate) / 100).toFixed(2));

      taxable += lineTaxable;
      cgst += lineCgst;
      sgst += lineSgst;
    }

    taxable = Number(taxable.toFixed(2));
    cgst = Number(cgst.toFixed(2));
    sgst = Number(sgst.toFixed(2));
    const rawBill = taxable + cgst + sgst;
    const rounded = Math.round(rawBill);
    const roundOff = Number((rounded - rawBill).toFixed(2));

    return {
      taxableTotal: taxable.toFixed(2),
      cgstTotal: cgst.toFixed(2),
      sgstTotal: sgst.toFixed(2),
      roundOff: roundOff.toFixed(2),
      billAmount: rounded.toFixed(2),
    };
  };

  const liveTotals = calculateLiveTotals();

  // Save Invoice (POST /invoices - uses atomic numbering)
  const handleSaveInvoice = async () => {
    if (!selectedCustomerId) {
      showToast('Please select a customer for the invoice', 'error');
      return;
    }

    if (invoiceItems.length === 0) {
      showToast('Please add at least one product with quantity', 'error');
      return;
    }

    setCreatingInvoice(true);
    setSavedInvoiceJSON(null);
    try {
      const payload = {
        customerId: selectedCustomerId,
        items: invoiceItems.map((item) => ({
          productId: item.productId,
          qty: item.qty,
        })),
      };

      const res = await fetch('/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save invoice');
      }

      showToast(`Invoice ${data.invoiceNumber} created atomically!`, 'success');
      setSavedInvoiceJSON(data);
      setLookupInvoiceId(data.id);
      setInvoiceItems([]);
      await loadData(); // refresh product stock levels
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingInvoice(false);
    }
  };

  // Test GET /invoices/:id
  const handleLookupInvoice = async (e) => {
    e.preventDefault();
    if (!lookupInvoiceId.trim()) return;

    setLookingUp(true);
    setLookupResult(null);
    try {
      const res = await fetch(`/invoices/${lookupInvoiceId.trim()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invoice not found');
      setLookupResult(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLookingUp(false);
    }
  };

  const selectedProdObj = products.find((p) => p.id === selectedProductId);

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          className="alert-toast"
          style={{
            borderColor: toast.type === 'error' ? 'var(--rose)' : 'var(--emerald)',
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={20} style={{ color: 'var(--rose)' }} />
          ) : (
            <CheckCircle2 size={20} style={{ color: 'var(--emerald)' }} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'var(--primary-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Receipt size={22} color="white" />
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700 }}>
              {companySettings.name || 'Prathna Enterprises'}{' '}
              <span style={{ fontSize: '0.78rem', color: 'var(--emerald)', padding: '3px 9px', background: 'var(--emerald-glow)', borderRadius: '12px' }}>
                Slice 2: Purchases & PDF
              </span>
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.9rem' }}>
            Atomic Invoice Numbering • Stock-Increasing Purchases • Configurable Company Settings • Server-Generated A4 PDF
          </p>
        </div>

        <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loadingInitial}>
          <RefreshCw size={14} className={loadingInitial ? 'spin' : ''} /> Refresh Data
        </button>
      </header>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'invoice' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('invoice')}
        >
          <Receipt size={16} /> Invoices
        </button>
        <button
          className={`btn ${activeTab === 'purchase' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('purchase')}
        >
          <Truck size={16} /> Purchases ({purchases.length})
        </button>
        <button
          className={`btn ${activeTab === 'supplier' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('supplier')}
        >
          <Building2 size={16} /> Suppliers ({suppliers.length})
        </button>
        <button
          className={`btn ${activeTab === 'product' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('product')}
        >
          <Package size={16} /> Products ({products.length})
        </button>
        <button
          className={`btn ${activeTab === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('customer')}
        >
          <UserPlus size={16} /> Customers ({customers.length})
        </button>
        <button
          className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={16} /> Settings (PDF Header)
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB: INVOICES (Slice 1 + Atomic Numbering + Download PDF) */}
      {/* ========================================================================= */}
      {activeTab === 'invoice' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Customer Selection */}
              <div className="glass-card">
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '12px' }}>
                  Customer Selection
                </h2>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Select Customer *</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                      className="form-select"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                    >
                      <option value="">-- Choose Customer --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.mobile ? `(${c.mobile})` : ''} {c.gstin ? `[GSTIN: ${c.gstin}]` : ''}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-secondary" onClick={() => setActiveTab('customer')}>
                      + New
                    </button>
                  </div>
                </div>
              </div>

              {/* Product Picker & Quantity */}
              <div className="glass-card" style={{ border: '1px solid var(--border-focus)' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '12px' }}>
                  Add Products to Invoice
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Choose Product</label>
                    <select
                      className="form-select"
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                    >
                      <option value="">-- Select Product --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — Rate: ₹{Number(p.sellingPrice).toFixed(2)} (Stock: {Number(p.currentStock)} {p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                    />
                  </div>

                  <button className="btn btn-primary" onClick={handleAddItemToInvoice} style={{ height: '42px' }}>
                    <Plus size={16} /> Add Item
                  </button>
                </div>

                {selectedProdObj && (
                  <div style={{ marginTop: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    HSN: <strong>{selectedProdObj.hsnCode}</strong> | GST Rate: <strong>{Number(selectedProdObj.gstRate)}%</strong> | Available Stock:{' '}
                    <strong style={{ color: Number(selectedProdObj.currentStock) > 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                      {Number(selectedProdObj.currentStock)} {selectedProdObj.unit}
                    </strong>
                  </div>
                )}
              </div>

              {/* Added Items List */}
              <div className="glass-card">
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '14px' }}>
                  Invoice Items ({invoiceItems.length})
                </h2>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Product</th>
                        <th>HSN</th>
                        <th>Qty</th>
                        <th>Rate (₹)</th>
                        <th>Taxable (₹)</th>
                        <th>GST (50/50)</th>
                        <th>Total (₹)</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceItems.length > 0 ? (
                        invoiceItems.map((item, idx) => {
                          const taxable = Number((item.qty * Number(item.sellingPrice)).toFixed(2));
                          const halfGst = Number(item.gstRate) / 2;
                          const cgst = Number(((taxable * halfGst) / 100).toFixed(2));
                          const sgst = Number(((taxable * halfGst) / 100).toFixed(2));
                          const total = Number((taxable + cgst + sgst).toFixed(2));

                          return (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td style={{ fontWeight: 600 }}>{item.name}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{item.hsnCode}</td>
                              <td style={{ fontWeight: 700 }}>{item.qty}</td>
                              <td>₹{Number(item.sellingPrice).toFixed(2)}</td>
                              <td>₹{taxable.toFixed(2)}</td>
                              <td style={{ fontSize: '0.78rem' }}>
                                <span style={{ color: 'var(--emerald)' }}>₹{(cgst + sgst).toFixed(2)}</span>
                                <div style={{ color: 'var(--text-muted)' }}>{item.gstRate}% (C+S)</div>
                              </td>
                              <td style={{ fontWeight: 700 }}>₹{total.toFixed(2)}</td>
                              <td>
                                <button
                                  className="btn btn-danger btn-sm"
                                  style={{ padding: '4px 6px' }}
                                  onClick={() => handleRemoveInvoiceItem(idx)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>
                            No products added yet. Choose a product and click "Add Item".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Live Total Preview & Save */}
            <div>
              <div className="glass-card" style={{ position: 'sticky', top: '24px' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                  Live Total Preview
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '16px 0' }}>
                  <div className="summary-row">
                    <span>Taxable Value:</span>
                    <span>₹{liveTotals.taxableTotal}</span>
                  </div>
                  <div className="summary-row">
                    <span>CGST (Intra-state):</span>
                    <span>₹{liveTotals.cgstTotal}</span>
                  </div>
                  <div className="summary-row">
                    <span>SGST (Intra-state):</span>
                    <span>₹{liveTotals.sgstTotal}</span>
                  </div>
                  <div className="summary-row">
                    <span>Round-off:</span>
                    <span>₹{liveTotals.roundOff}</span>
                  </div>
                  <div className="summary-row total">
                    <span>Bill Amount:</span>
                    <span style={{ color: 'var(--emerald)' }}>₹{liveTotals.billAmount}</span>
                  </div>
                </div>

                <button
                  className="btn btn-emerald"
                  style={{ width: '100%', padding: '14px', fontSize: '1rem', marginTop: '12px' }}
                  onClick={handleSaveInvoice}
                  disabled={creatingInvoice || invoiceItems.length === 0}
                >
                  {creatingInvoice ? 'Saving with Atomic Number...' : 'Save Invoice'}
                </button>
              </div>
            </div>
          </div>

          {/* DELIVERABLE: SAVED INVOICE VIEW WITH DOWNLOAD PDF BUTTON */}
          {savedInvoiceJSON && (
            <div className="glass-card" style={{ marginTop: '32px', border: '1px solid var(--emerald)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={20} /> Invoice {savedInvoiceJSON.invoiceNumber} Created
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a
                    href={`/invoices/${savedInvoiceJSON.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary btn-sm"
                  >
                    <Download size={15} /> Download A4 PDF
                  </a>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSavedInvoiceJSON(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Assigned sequential number atomically via database sequence. Click "Download A4 PDF" to view or print the generated invoice.
              </p>
              <pre
                style={{
                  background: '#090d16',
                  padding: '16px',
                  borderRadius: '8px',
                  overflowX: 'auto',
                  fontSize: '0.82rem',
                  color: '#38bdf8',
                  lineHeight: 1.4,
                  maxHeight: '350px',
                }}
              >
                {JSON.stringify(savedInvoiceJSON, null, 2)}
              </pre>
            </div>
          )}

          {/* Verification Lookup for GET /invoices/:id and PDF */}
          <div className="glass-card" style={{ marginTop: '32px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={18} style={{ color: 'var(--primary)' }} /> Lookup Saved Invoice & Download PDF
            </h3>
            <form onSubmit={handleLookupInvoice} style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Paste Invoice UUID..."
                value={lookupInvoiceId}
                onChange={(e) => setLookupInvoiceId(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary" disabled={lookingUp || !lookupInvoiceId}>
                {lookingUp ? 'Fetching...' : 'Fetch by ID'}
              </button>
            </form>

            {lookupResult && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Invoice {lookupResult.invoiceNumber} — ₹{lookupResult.billAmount}
                  </span>
                  <a
                    href={`/invoices/${lookupResult.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary btn-sm"
                  >
                    <Download size={14} /> Download PDF
                  </a>
                </div>
                <pre
                  style={{
                    background: '#090d16',
                    padding: '16px',
                    borderRadius: '8px',
                    overflowX: 'auto',
                    fontSize: '0.82rem',
                    color: '#4ade80',
                    lineHeight: 1.4,
                    maxHeight: '260px',
                  }}
                >
                  {JSON.stringify(lookupResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: PURCHASES (Slice 2) */}
      {/* ========================================================================= */}
      {activeTab === 'purchase' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Purchase Details */}
              <div className="glass-card">
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={20} style={{ color: 'var(--emerald)' }} /> Inward Stock Purchase
                </h2>

                <div className="form-grid">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Supplier *</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        className="form-select"
                        value={selectedSupplierId}
                        onChange={(e) => setSelectedSupplierId(e.target.value)}
                      >
                        <option value="">-- Choose Supplier --</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.gstin ? `[GSTIN: ${s.gstin}]` : ''}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('supplier')}>
                        + New
                      </button>
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Invoice / Reference # *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. SUP-INV-9921"
                      value={purchaseRefNumber}
                      onChange={(e) => setPurchaseRefNumber(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Purchase Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Add Product Line for Purchase */}
              <div className="glass-card" style={{ border: '1px solid var(--border-focus)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '12px' }}>
                  Add Inward Product to Purchase
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Select Product</label>
                    <select
                      className="form-select"
                      value={purchaseProdId}
                      onChange={(e) => {
                        setPurchaseProdId(e.target.value);
                        const found = products.find((p) => p.id === e.target.value);
                        if (found) setPurchaseRate(String(found.purchasePrice));
                      }}
                    >
                      <option value="">-- Select Product --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Current Stock: {Number(p.currentStock)} {p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Inward Qty</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={purchaseQty}
                      onChange={(e) => setPurchaseQty(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Purchase Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      placeholder="Rate"
                      value={purchaseRate}
                      onChange={(e) => setPurchaseRate(e.target.value)}
                    />
                  </div>

                  <button className="btn btn-primary" onClick={handleAddPurchaseItem} style={{ height: '42px' }}>
                    <Plus size={16} /> Add Line
                  </button>
                </div>
              </div>

              {/* Purchase Items Table */}
              <div className="glass-card">
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '14px' }}>
                  Inward Items to Stock ({purchaseItems.length})
                </h3>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Product</th>
                        <th>HSN</th>
                        <th>Inward Qty</th>
                        <th>Rate (₹)</th>
                        <th>GST %</th>
                        <th>Line Total (₹)</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseItems.length > 0 ? (
                        purchaseItems.map((item, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{item.hsnCode}</td>
                            <td style={{ color: 'var(--emerald)', fontWeight: 700 }}>+{item.qty}</td>
                            <td>₹{item.rate.toFixed(2)}</td>
                            <td>{item.gstRate}%</td>
                            <td style={{ fontWeight: 700 }}>₹{item.total.toFixed(2)}</td>
                            <td>
                              <button
                                className="btn btn-danger btn-sm"
                                style={{ padding: '4px 6px' }}
                                onClick={() => setPurchaseItems(purchaseItems.filter((_, i) => i !== idx))}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>
                            No purchase items added yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Summary & Save Purchase */}
            <div>
              <div className="glass-card" style={{ position: 'sticky', top: '24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                  Purchase Summary
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '16px 0' }}>
                  <div className="summary-row">
                    <span>Total Inward Items:</span>
                    <span>{purchaseItems.length} lines</span>
                  </div>
                  <div className="summary-row">
                    <span>Total Inward Quantity:</span>
                    <span style={{ color: 'var(--emerald)', fontWeight: 700 }}>
                      +{purchaseItems.reduce((sum, i) => sum + i.qty, 0)} units
                    </span>
                  </div>
                  <div className="summary-row total">
                    <span>Purchase Value:</span>
                    <span style={{ color: 'var(--emerald)' }}>
                      ₹{purchaseItems.reduce((sum, i) => sum + i.total, 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  className="btn btn-emerald"
                  style={{ width: '100%', padding: '14px', fontSize: '1rem', marginTop: '12px' }}
                  onClick={handleSavePurchase}
                  disabled={creatingPurchase || purchaseItems.length === 0}
                >
                  {creatingPurchase ? 'Saving & Increasing Stock...' : 'Save Purchase & Increase Stock'}
                </button>
              </div>
            </div>
          </div>

          {/* Recent Purchases History */}
          <div className="glass-card" style={{ marginTop: '32px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '14px' }}>
              Recent Inward Purchases
            </h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ref / Invoice #</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Total Value (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{p.referenceNumber}</td>
                      <td>{p.supplier?.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {new Date(p.purchaseDate || p.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>{p.items?.length || 0} products</td>
                      <td style={{ fontWeight: 700 }}>₹{Number(p.totalAmount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: SUPPLIERS (Slice 2) */}
      {/* ========================================================================= */}
      {activeTab === 'supplier' && (
        <div className="glass-card" style={{ maxWidth: '750px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={20} style={{ color: 'var(--primary)' }} /> Add New Supplier
          </h2>
          <form onSubmit={handleCreateSupplier}>
            <div className="form-group">
              <label className="form-label">Supplier / Business Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Havells India Distribution Hub"
                value={supplierForm.name}
                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 9822211100"
                  value={supplierForm.mobile}
                  onChange={(e) => setSupplierForm({ ...supplierForm, mobile: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 24AAPEX1234A1Z1"
                  value={supplierForm.gstin}
                  onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">PAN</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. AAPEX1234A"
                  value={supplierForm.pan}
                  onChange={(e) => setSupplierForm({ ...supplierForm, pan: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea
                className="form-input"
                rows="2"
                placeholder="Warehouse or office address, city, state"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '12px' }} disabled={creatingSupplier}>
              {creatingSupplier ? 'Saving Supplier...' : 'Save Supplier'}
            </button>
          </form>

          {/* Existing Suppliers */}
          <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <h3 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Existing Suppliers ({suppliers.length})
            </h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Supplier Name</th>
                    <th>Mobile</th>
                    <th>GSTIN</th>
                    <th>PAN</th>
                    <th>Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td>{s.mobile || '—'}</td>
                      <td style={{ color: 'var(--emerald)' }}>{s.gstin || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{s.pan || '—'}</td>
                      <td>{s._count?.purchases || 0} orders</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: SETTINGS (Slice 2: Configurable Company Header for PDF) */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <div className="glass-card" style={{ maxWidth: '750px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} style={{ color: 'var(--primary)' }} /> Company Details & Invoice Header (A4 PDF)
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
            These details are embedded dynamically onto every generated A4 PDF tax invoice.
          </p>

          <form onSubmit={handleSaveSettings}>
            <div className="form-group">
              <label className="form-label">Company / Legal Entity Name *</label>
              <input
                type="text"
                className="form-input"
                value={companySettings.name || ''}
                onChange={(e) => setCompanySettings({ ...companySettings, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Registered Office / Shop Address</label>
              <textarea
                className="form-input"
                rows="2"
                value={companySettings.address || ''}
                onChange={(e) => setCompanySettings({ ...companySettings, address: e.target.value })}
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input
                  type="text"
                  className="form-input"
                  value={companySettings.phone || ''}
                  onChange={(e) => setCompanySettings({ ...companySettings, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input
                  type="text"
                  className="form-input"
                  value={companySettings.gstin || ''}
                  onChange={(e) => setCompanySettings({ ...companySettings, gstin: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">PAN</label>
                <input
                  type="text"
                  className="form-input"
                  value={companySettings.pan || ''}
                  onChange={(e) => setCompanySettings({ ...companySettings, pan: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Invoice Terms & Conditions</label>
              <textarea
                className="form-input"
                rows="3"
                value={companySettings.terms || ''}
                onChange={(e) => setCompanySettings({ ...companySettings, terms: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '12px' }} disabled={savingSettings}>
              {savingSettings ? 'Saving Settings...' : 'Save Company Details'}
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: PRODUCTS */}
      {/* ========================================================================= */}
      {activeTab === 'product' && (
        <div className="glass-card" style={{ maxWidth: '700px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={20} style={{ color: 'var(--primary)' }} /> Create Product
          </h2>
          <form onSubmit={handleCreateProduct}>
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Havells 15W LED Bulb"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">HSN Code *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 9405"
                  value={productForm.hsnCode}
                  onChange={(e) => setProductForm({ ...productForm, hsnCode: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">GST Rate (%) *</label>
                <select
                  className="form-select"
                  value={productForm.gstRate}
                  onChange={(e) => setProductForm({ ...productForm, gstRate: e.target.value })}
                >
                  <option value="0.00">0% (Nil)</option>
                  <option value="5.00">5%</option>
                  <option value="12.00">12%</option>
                  <option value="18.00">18% (Standard)</option>
                  <option value="28.00">28%</option>
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
                  value={productForm.purchasePrice}
                  onChange={(e) => setProductForm({ ...productForm, purchasePrice: e.target.value })}
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
                  value={productForm.sellingPrice}
                  onChange={(e) => setProductForm({ ...productForm, sellingPrice: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Opening Stock (Units)</label>
                <input
                  type="number"
                  step="1"
                  className="form-input"
                  placeholder="0"
                  value={productForm.openingStock}
                  onChange={(e) => setProductForm({ ...productForm, openingStock: e.target.value })}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '12px' }} disabled={creatingProduct}>
              {creatingProduct ? 'Saving Product...' : 'Save Product'}
            </button>
          </form>

          {/* Current Products Preview List */}
          <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <h3 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Existing Products ({products.length})
            </h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>HSN</th>
                    <th>GST %</th>
                    <th>Purchase (₹)</th>
                    <th>Selling (₹)</th>
                    <th>Current Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.hsnCode}</td>
                      <td>{Number(p.gstRate)}%</td>
                      <td>₹{Number(p.purchasePrice).toFixed(2)}</td>
                      <td>₹{Number(p.sellingPrice).toFixed(2)}</td>
                      <td style={{ color: Number(p.currentStock) > 0 ? 'var(--emerald)' : 'var(--rose)', fontWeight: 700 }}>
                        {Number(p.currentStock)} {p.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: CUSTOMERS */}
      {/* ========================================================================= */}
      {activeTab === 'customer' && (
        <div className="glass-card" style={{ maxWidth: '700px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={20} style={{ color: 'var(--primary)' }} /> Create Customer
          </h2>
          <form onSubmit={handleCreateCustomer}>
            <div className="form-group">
              <label className="form-label">Customer / Trade Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Ramesh Hardware Store"
                value={customerForm.name}
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 9876543210"
                  value={customerForm.mobile}
                  onChange={(e) => setCustomerForm({ ...customerForm, mobile: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">GSTIN (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 24AAAAA0000A1Z5"
                  value={customerForm.gstin}
                  onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea
                className="form-input"
                rows="2"
                placeholder="Shop address, city, state"
                value={customerForm.address}
                onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '12px' }} disabled={creatingCustomer}>
              {creatingCustomer ? 'Saving Customer...' : 'Save Customer'}
            </button>
          </form>

          {/* Current Customers Preview List */}
          <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <h3 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Existing Customers ({customers.length})
            </h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Mobile</th>
                    <th>GSTIN</th>
                    <th>Address</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{c.mobile || '—'}</td>
                      <td>{c.gstin ? <span style={{ color: 'var(--emerald)' }}>{c.gstin}</span> : 'Unregistered'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
