import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  UserPlus,
  Receipt,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Truck,
  Building2,
  Settings,
  Download,
  RotateCcw,
  LayoutDashboard,
  BarChart3,
  Calendar,
  AlertTriangle,
  LogOut,
  X,
  Lock,
  Eye,
  FileText,
  Upload,
} from 'lucide-react';

// Reference map of all 37 Indian GST State/UT codes
const INDIAN_STATES = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

function getStateCodeFromGSTIN(gstin) {
  if (!gstin || typeof gstin !== 'string') return null;
  const clean = gstin.trim().toUpperCase();
  if (clean.length < 2) return null;
  const prefix = clean.slice(0, 2);
  return INDIAN_STATES[prefix] ? prefix : null;
}

function getStateNameByCode(code) {
  if (!code) return 'Unknown State';
  return INDIAN_STATES[code] || `State (${code})`;
}

function resolveCustomerStateCode(customer) {
  if (!customer) return null;
  // Strict precedence: GSTIN always wins when valid
  if (customer.gstin) {
    const fromGstin = getStateCodeFromGSTIN(customer.gstin);
    if (fromGstin) return fromGstin;
  }
  if (customer.state && INDIAN_STATES[customer.state.trim()]) {
    return customer.state.trim();
  }
  return null;
}

const VALID_TABS = ['dashboard', 'invoice', 'purchase', 'product', 'customer', 'supplier', 'reports', 'settings'];
const VALID_REPORT_SUBTABS = ['sales', 'purchases', 'stock'];

function getInitialNavigation() {
  // 1. Check window.location.hash first (e.g. #reports/stock or #invoice)
  try {
    const rawHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    if (rawHash) {
      const parts = rawHash.split('/');
      const tab = parts[0];
      const subTab = parts[1];
      if (VALID_TABS.includes(tab)) {
        return {
          tab,
          reportSubTab: VALID_REPORT_SUBTABS.includes(subTab)
            ? subTab
            : (localStorage.getItem('prathna_report_sub_tab') || 'sales'),
        };
      }
    }
  } catch {}

  // 2. Check localStorage fallback
  try {
    const savedTab = localStorage.getItem('prathna_active_tab');
    const savedSubTab = localStorage.getItem('prathna_report_sub_tab');
    return {
      tab: VALID_TABS.includes(savedTab) ? savedTab : 'dashboard',
      reportSubTab: VALID_REPORT_SUBTABS.includes(savedSubTab) ? savedSubTab : 'sales',
    };
  } catch {
    return { tab: 'dashboard', reportSubTab: 'sales' };
  }
}

export default function App() {
  // Authentication State
  const [token, setToken] = useState(() => localStorage.getItem('prathna_token') || '');
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('prathna_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Login & Register Form State
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Password Change Enforcement State
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [passwordChangeForm, setPasswordChangeForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');

  // Navigation tabs: 'dashboard' | 'invoice' | 'purchase' | 'product' | 'customer' | 'supplier' | 'reports' | 'settings'
  const [activeTab, setActiveTab] = useState(() => getInitialNavigation().tab);

  // Core collections
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [companySettings, setCompanySettings] = useState({
    name: '',
    address: '',
    phone: '',
    gstin: '',
    pan: '',
    logoUrl: '',
    terms: '',
    termsGujarati: '',
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [toast, setToast] = useState(null);

  // Form: Create Product
  const [productForm, setProductForm] = useState({
    name: '',
    hsnCode: '',
    gstRate: '18.00',
    purchasePrice: '',
    sellingPrice: '',
    openingStock: '10',
    minStockLevel: '10',
  });
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Form: Create Customer
  const [customerForm, setCustomerForm] = useState({
    name: '',
    mobile: '',
    address: '',
    gstin: '',
    state: '24', // Default to Gujarat (code: 24)
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Form: Create Supplier
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    mobile: '',
    address: '',
    gstin: '',
    pan: '',
    notes: '',
  });
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  // Form: Create Purchase
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
  const [recentCustomers, setRecentCustomers] = useState([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [invoiceTaxType, setInvoiceTaxType] = useState('INTRASTATE');
  const [taxTypeManualOverride, setTaxTypeManualOverride] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemRate, setItemRate] = useState('');
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [savedInvoiceJSON, setSavedInvoiceJSON] = useState(null);

  // Settings state
  const [savingSettings, setSavingSettings] = useState(false);

  // Past Invoices & Search state
  const [invoiceSubTab, setInvoiceSubTab] = useState('create'); // 'create' | 'history'
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [searchedInvoices, setSearchedInvoices] = useState(null);
  const [searchingInvoices, setSearchingInvoices] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);

  // Sales Return Modal State
  const [returnModalInvoice, setReturnModalInvoice] = useState(null);
  const [returnQuantities, setReturnQuantities] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // Reports state
  const [reportSubTab, setReportSubTab] = useState(() => getInitialNavigation().reportSubTab); // 'sales' | 'purchases' | 'stock'
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [salesReportData, setSalesReportData] = useState(null);
  const [purchasesReportData, setPurchasesReportData] = useState(null);
  const [stockReportData, setStockReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Authenticated fetch wrapper
  const authFetch = async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    let res;
    try {
      res = await fetch(url, { ...options, headers });
    } catch (networkErr) {
      console.error(`Network fetch failed for ${url}:`, networkErr);
      throw new Error('Unable to connect to billing server. Please check your network.');
    }

    if (res.status === 401) {
      handleLogout('Your session has expired. Please log in again.');
      throw new Error('Session expired');
    }
    if (res.status === 403) {
      const cloned = res.clone();
      try {
        const d = await cloned.json();
        if (d.error === 'password-change-required') {
          setShowPasswordChangeModal(true);
          throw new Error('Please change your password to continue.');
        }
      } catch (e) {
        if (e.message === 'Please change your password to continue.') throw e;
      }
    }
    return res;
  };

  const [dataLoadError, setDataLoadError] = useState('');
  const [reportError, setReportError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Incorrect email or password. Please try again.');
      }
      setToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem('prathna_token', data.token);
      localStorage.setItem('prathna_user', JSON.stringify(data.user));
      showToast(`Welcome back, ${data.user.name}`);
      if (data.user?.mustChangePassword) {
        setShowPasswordChangeModal(true);
      }
    } catch (err) {
      setLoginError(err.message || 'Incorrect email or password. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account');
      }
      setToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem('prathna_token', data.token);
      localStorage.setItem('prathna_user', JSON.stringify(data.user));
      showToast(`Account created. Welcome, ${data.user.name}`);
    } catch (err) {
      setLoginError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = (msg) => {
    setToken('');
    setCurrentUser(null);
    setShowPasswordChangeModal(false);
    localStorage.removeItem('prathna_token');
    localStorage.removeItem('prathna_user');
    localStorage.removeItem('prathna_active_tab');
    localStorage.removeItem('prathna_report_sub_tab');
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setActiveTab('dashboard');
    setReportSubTab('sales');
    if (msg && typeof msg === 'string') {
      showToast(msg, 'error');
    } else {
      showToast('You have logged out.');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordChangeError('');
    if (!passwordChangeForm.currentPassword) {
      setPasswordChangeError('Current password is required.');
      return;
    }
    if (!passwordChangeForm.newPassword || passwordChangeForm.newPassword.length < 8) {
      setPasswordChangeError('New password must be at least 8 characters long.');
      return;
    }
    if (passwordChangeForm.newPassword !== passwordChangeForm.confirmPassword) {
      setPasswordChangeError('New passwords do not match.');
      return;
    }
    if (passwordChangeForm.currentPassword === passwordChangeForm.newPassword) {
      setPasswordChangeError('New password must be different from current password.');
      return;
    }

    setPasswordChangeLoading(true);
    try {
      const res = await fetch('/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordChangeForm.currentPassword,
          newPassword: passwordChangeForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to change password.');
      }

      setToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem('prathna_token', data.token);
      localStorage.setItem('prathna_user', JSON.stringify(data.user));
      setShowPasswordChangeModal(false);
      setPasswordChangeForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Password updated successfully!');
      loadData();
    } catch (err) {
      setPasswordChangeError(err.message || 'Failed to change password.');
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  // Load initial data and dashboard summary
  const loadData = async () => {
    if (!token) return;
    setLoadingInitial(true);
    setDataLoadError('');
    try {
      const [pRes, cRes, sRes, puRes, setRes, dashRes, recRes, invRes] = await Promise.all([
        authFetch('/products'),
        authFetch('/customers'),
        authFetch('/suppliers'),
        authFetch('/purchases'),
        authFetch('/settings'),
        authFetch('/dashboard/summary'),
        authFetch('/customers/recent').catch(() => null),
        authFetch('/invoices').catch(() => null),
      ]);

      const [pData, cData, sData, puData, setData, dashData, recData, invData] = await Promise.all([
        pRes.json(),
        cRes.json(),
        sRes.json(),
        puRes.json(),
        setRes.json(),
        dashRes.json(),
        recRes ? recRes.json().catch(() => []) : [],
        invRes ? invRes.json().catch(() => []) : [],
      ]);

      setProducts(Array.isArray(pData) ? pData : []);
      setCustomers(Array.isArray(cData) ? cData : []);
      setRecentCustomers(Array.isArray(recData) ? recData : []);
      setSuppliers(Array.isArray(sData) ? sData : []);
      setPurchases(Array.isArray(puData) ? puData : []);
      setInvoices(Array.isArray(invData) ? invData : []);
      if (setData && !setData.error) setCompanySettings(setData);
      if (dashData && !dashData.error) {
        setDashboardSummary(dashData);
      } else {
        setDataLoadError("Couldn't load dashboard summary — try refreshing");
      }

      if (Array.isArray(cData) && cData.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(cData[0].id);
      }
      if (Array.isArray(sData) && sData.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(sData[0].id);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
      if (err.message !== 'Session expired') {
        const errorMsg = err.message || "Couldn't load the dashboard — try refreshing";
        setDataLoadError(errorMsg);
        showToast("Couldn't load store data — try refreshing", 'error');
      }
    } finally {
      setLoadingInitial(false);
    }
  };

  // Fetch initial public system and branding status (runs on mount even before login)
  useEffect(() => {
    fetch('/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasUsers === false) {
          setIsRegisterMode(true);
        }
        if (data.company) {
          setCompanySettings((prev) => ({
            ...prev,
            name: data.company.name || prev.name,
            logoUrl: data.company.logoUrl !== undefined ? data.company.logoUrl : prev.logoUrl,
          }));
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch public auth/branding status:', err);
      });
  }, []);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  useEffect(() => {
    if (currentUser?.mustChangePassword) {
      setShowPasswordChangeModal(true);
    }
  }, [currentUser]);

  // Auto-detect tax type based on selected customer state vs company state
  useEffect(() => {
    if (!selectedCustomerId) return;
    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (!customer) return;

    // Strict precedence: GSTIN state code first, then customer.state, then default '24' (Gujarat)
    const custState = resolveCustomerStateCode(customer) || (customer.state ? customer.state.trim() : '24');
    const compGstin = companySettings?.gstin || '';
    const compState = getStateCodeFromGSTIN(compGstin) || '24';

    if (!taxTypeManualOverride) {
      setInvoiceTaxType(custState === compState ? 'INTRASTATE' : 'INTERSTATE');
    }
  }, [selectedCustomerId, customers, companySettings, taxTypeManualOverride]);

  // Fetch reports based on sub-tab and filters
  const loadReport = async () => {
    if (!token) return;
    setLoadingReport(true);
    setReportError('');
    try {
      const params = new URLSearchParams();
      if (reportFromDate) params.append('from', reportFromDate);
      if (reportToDate) params.append('to', reportToDate);

      if (reportSubTab === 'sales') {
        const res = await authFetch(`/reports/sales?${params.toString()}`);
        const data = await res.json();
        setSalesReportData(data);
      } else if (reportSubTab === 'purchases') {
        const res = await authFetch(`/reports/purchases?${params.toString()}`);
        const data = await res.json();
        setPurchasesReportData(data);
      } else if (reportSubTab === 'stock') {
        const res = await authFetch('/reports/stock');
        const data = await res.json();
        setStockReportData(data);
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      if (err.message !== 'Session expired') {
        setReportError("Couldn't load report data — try refreshing");
        showToast("Couldn't load report — try refreshing", 'error');
      }
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (token && activeTab === 'reports') {
      loadReport();
    }
  }, [token, activeTab, reportSubTab]);

  // Synchronize activeTab and reportSubTab with URL hash and localStorage
  useEffect(() => {
    try {
      localStorage.setItem('prathna_active_tab', activeTab);
      localStorage.setItem('prathna_report_sub_tab', reportSubTab);
      const targetHash = activeTab === 'reports' ? `#reports/${reportSubTab}` : `#${activeTab}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, '', targetHash);
      }
    } catch (e) {
      console.error('Failed to sync navigation state:', e);
    }
  }, [activeTab, reportSubTab]);

  // Support browser Back and Forward navigation buttons
  useEffect(() => {
    const handleHashChange = () => {
      const nav = getInitialNavigation();
      setActiveTab(nav.tab);
      if (nav.tab === 'reports' && nav.reportSubTab) {
        setReportSubTab(nav.reportSubTab);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [pdfCopyType, setPdfCopyType] = useState('Original');

  // Download PDF helper
  const handleDownloadPdf = async (invId, invNumber, copy = pdfCopyType) => {
    try {
      const res = await authFetch(`/invoices/${invId}/pdf?copy=${encodeURIComponent(copy)}`);
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invNumber || 'Invoice'}-${copy}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Could not download PDF invoice', 'error');
    }
  };

  // --- Handlers: Product ---
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!productForm.name || !productForm.hsnCode || !productForm.purchasePrice || !productForm.sellingPrice) {
      showToast('Please fill all required product fields', 'error');
      return;
    }

    setCreatingProduct(true);
    try {
      const res = await authFetch('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create product');

      showToast(`Product "${data.name}" added with ${data.currentStock} units stock!`, 'success');
      setProductForm({
        name: '',
        hsnCode: '',
        gstRate: '18.00',
        purchasePrice: '',
        sellingPrice: '',
        openingStock: '10',
        minStockLevel: '10',
      });
      await loadData();
      setActiveTab('product');
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
      const res = await authFetch('/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add customer');

      showToast(`Customer "${data.name}" added successfully!`, 'success');
      setCustomerForm({ name: '', mobile: '', address: '', gstin: '' });
      await loadData();
      setSelectedCustomerId(data.id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingCustomer(false);
    }
  };

  // --- Handlers: Supplier ---
  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name) {
      showToast('Supplier name is required', 'error');
      return;
    }

    setCreatingSupplier(true);
    try {
      const res = await authFetch('/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierForm),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add supplier');

      showToast(`Supplier "${data.name}" added successfully!`, 'success');
      setSupplierForm({ name: '', mobile: '', address: '', gstin: '', pan: '', notes: '' });
      await loadData();
      setSelectedSupplierId(data.id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingSupplier(false);
    }
  };

  // --- Handlers: Purchase ---
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
      showToast('Please enter supplier invoice / bill number', 'error');
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

      const res = await authFetch('/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save purchase');

      showToast(`Purchase "${data.referenceNumber}" recorded and stock increased!`, 'success');
      setPurchaseItems([]);
      setPurchaseRefNumber('');
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingPurchase(false);
    }
  };

  // --- Handlers: Settings ---
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await authFetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companySettings),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      setCompanySettings(data);
      showToast('Company details saved successfully!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type (PNG / JPEG)
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      showToast('Please select a PNG or JPG image file', 'error');
      e.target.value = '';
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Logo file size must be under 5MB', 'error');
      e.target.value = '';
      return;
    }

    setUploadingLogo(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Image = reader.result;
          const res = await authFetch('/settings/logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to upload logo');

          setCompanySettings((prev) => ({
            ...prev,
            logoUrl: data.logoUrl,
          }));
          showToast('Company logo updated successfully!', 'success');
        } catch (uploadErr) {
          showToast(uploadErr.message, 'error');
        } finally {
          setUploadingLogo(false);
          if (logoInputRef.current) logoInputRef.current.value = '';
        }
      };
      reader.onerror = () => {
        showToast('Failed to read image file', 'error');
        setUploadingLogo(false);
        if (logoInputRef.current) logoInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      showToast(err.message, 'error');
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm('Are you sure you want to remove the company logo and revert to text branding?')) {
      return;
    }
    setUploadingLogo(true);
    try {
      const res = await authFetch('/settings/logo', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove logo');

      setCompanySettings((prev) => ({
        ...prev,
        logoUrl: null,
      }));
      showToast('Company logo removed. Reverted to text branding.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploadingLogo(false);
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

    // Check stock warning if requested > currentStock
    if (qtyNum > Number(prod.currentStock)) {
      showToast(`Notice: Stock is only ${prod.currentStock} units`, 'error');
    }

    const rateNum = parseFloat(itemRate);
    const finalRate = !isNaN(rateNum) && rateNum >= 0 ? rateNum : Number(prod.sellingPrice);

    const existingIndex = invoiceItems.findIndex((i) => i.productId === prod.id);
    if (existingIndex > -1) {
      const updated = [...invoiceItems];
      updated[existingIndex].qty += qtyNum;
      updated[existingIndex].sellingPrice = finalRate;
      setInvoiceItems(updated);
    } else {
      setInvoiceItems([
        ...invoiceItems,
        {
          productId: prod.id,
          name: prod.name,
          hsnCode: prod.hsnCode,
          gstRate: prod.gstRate,
          sellingPrice: finalRate,
          currentStock: prod.currentStock,
          unit: prod.unit,
          qty: qtyNum,
        },
      ]);
    }

    setSelectedProductId('');
    setItemQty('1');
    setItemRate('');
  };

  const handleRemoveInvoiceItem = (index) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const calculateLiveTotals = () => {
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    const isInterstate = invoiceTaxType === 'INTERSTATE';

    for (const item of invoiceItems) {
      const lineTaxable = Number((item.qty * Number(item.sellingPrice)).toFixed(2));
      const rate = Number(item.gstRate);

      if (isInterstate) {
        const lineIgst = Number(((lineTaxable * rate) / 100).toFixed(2));
        igst += lineIgst;
      } else {
        const halfRate = rate / 2;
        const lineCgst = Number(((lineTaxable * halfRate) / 100).toFixed(2));
        const lineSgst = Number(((lineTaxable * halfRate) / 100).toFixed(2));
        cgst += lineCgst;
        sgst += lineSgst;
      }
      taxable += lineTaxable;
    }

    taxable = Number(taxable.toFixed(2));
    cgst = Number(cgst.toFixed(2));
    sgst = Number(sgst.toFixed(2));
    igst = Number(igst.toFixed(2));

    const rawBill = isInterstate ? taxable + igst : taxable + cgst + sgst;
    const rounded = Math.round(rawBill);
    const roundOff = Number((rounded - rawBill).toFixed(2));

    return {
      taxableTotal: taxable.toFixed(2),
      cgstTotal: cgst.toFixed(2),
      sgstTotal: sgst.toFixed(2),
      igstTotal: igst.toFixed(2),
      roundOff: roundOff.toFixed(2),
      billAmount: rounded.toFixed(2),
      taxType: invoiceTaxType,
    };
  };

  const liveTotals = calculateLiveTotals();

  const handleSaveInvoice = async () => {
    if (!selectedCustomerId) {
      showToast('Please select a customer for the invoice', 'error');
      return;
    }
    if (invoiceItems.length === 0) {
      showToast('Please add at least one item to invoice', 'error');
      return;
    }

    setCreatingInvoice(true);
    setSavedInvoiceJSON(null);
    try {
      const payload = {
        customerId: selectedCustomerId,
        taxType: invoiceTaxType,
        items: invoiceItems.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          rate: item.sellingPrice,
        })),
      };

      const res = await authFetch('/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        // Plain language error translation
        let msg = data.error || 'Failed to save invoice';
        if (msg.includes('Insufficient stock for product')) {
          msg = msg.replace('Insufficient stock for product', 'Not enough stock of');
        }
        throw new Error(msg);
      }

      showToast(`Invoice ${data.invoiceNumber} saved successfully!`, 'success');
      setSavedInvoiceJSON(data);
      setInvoices((prev) => [data, ...prev]);
      setInvoiceItems([]);
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingInvoice(false);
    }
  };

  // --- Handlers: Sales Returns ---
  const openReturnModal = async (invoice) => {
    try {
      const res = await authFetch(`/invoices/${invoice.id}`);
      const freshInv = await res.json();
      if (!res.ok) throw new Error('Failed to load invoice items');

      setReturnModalInvoice(freshInv);
      const initialQtys = {};
      freshInv.items.forEach((item) => {
        initialQtys[item.id] = '0';
      });
      setReturnQuantities(initialQtys);
      setReturnReason('');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSubmitSalesReturn = async (e) => {
    e.preventDefault();
    if (!returnModalInvoice) return;

    const itemsToReturn = Object.entries(returnQuantities)
      .map(([invoiceItemId, qtyStr]) => ({
        invoiceItemId,
        qty: parseFloat(qtyStr || '0'),
      }))
      .filter((i) => !isNaN(i.qty) && i.qty > 0);

    if (itemsToReturn.length === 0) {
      showToast('Please enter return quantity > 0 for at least one item', 'error');
      return;
    }

    setSubmittingReturn(true);
    try {
      const res = await authFetch(`/invoices/${returnModalInvoice.id}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: returnReason,
          items: itemsToReturn,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process return');

      showToast(`Sales return processed: ₹${data.totalAmount} refunded and stock added back!`, 'success');
      setReturnModalInvoice(null);
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const handleSearchInvoices = async (e) => {
    if (e) e.preventDefault();
    const q = invoiceSearchQuery.trim();
    if (!q) {
      setSearchedInvoices(null);
      return;
    }

    setSearchingInvoices(true);
    try {
      const res = await authFetch(`/invoices?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to search invoices');
      setSearchedInvoices(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 0) {
        showToast(`No invoices found matching "${q}"`, 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSearchingInvoices(false);
    }
  };

  const handleClearInvoiceSearch = () => {
    setInvoiceSearchQuery('');
    setSearchedInvoices(null);
  };

  // =========================================================================
  // IF NOT LOGGED IN -> RENDER CLEAN WHITE LOGIN SCREEN
  // =========================================================================
  if (!token) {
    return (
      <div className="login-screen">
        {toast && (
          <div className="toast-container">
            <div className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
              {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{toast.message}</span>
            </div>
          </div>
        )}

        <div className="login-card">
          <div className={`login-header ${companySettings.logoUrl ? 'login-header-centered' : ''}`}>
            {companySettings.logoUrl ? (
              <img
                src={companySettings.logoUrl}
                alt={companySettings.name || 'Company Logo'}
                className="login-logo"
              />
            ) : (
              <h1 className="login-title">{companySettings.name || 'Store Billing Counter'}</h1>
            )}
            <p className="login-subtitle">
              {isRegisterMode ? 'Create initial shop owner login' : 'Log in to open the billing counter'}
            </p>
          </div>

          {loginError && (
            <div className="banner banner-error">
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{loginError}</span>
            </div>
          )}

          {isRegisterMode ? (
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  placeholder="e.g. Ramesh Patel"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  placeholder="e.g. owner@example.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  placeholder="At least 6 characters"
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loggingIn}>
                {loggingIn ? 'Creating account...' : 'Create Account & Log In'}
              </button>

              <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Already have an account? </span>
                <button
                  type="button"
                  onClick={() => { setIsRegisterMode(false); setLoginError(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Log in here
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  placeholder="e.g. admin@example.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loggingIn}>
                {loggingIn ? 'Logging in...' : 'Log In to Billing'}
              </button>

              <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Setting up a new counter? </span>
                <button
                  type="button"
                  onClick={() => { setIsRegisterMode(true); setLoginError(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Create first account
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATED APP SHELL: SIDEBAR + MAIN CONTENT
  // =========================================================================
  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="sidebar-header">
          {companySettings.logoUrl ? (
            <img
              src={companySettings.logoUrl}
              alt={companySettings.name || 'Company Logo'}
              className="sidebar-logo"
            />
          ) : (
            <div className="sidebar-title">{companySettings.name || 'Your Company Name'}</div>
          )}
          <div className="sidebar-subtitle">Billing & Inventory</div>
        </div>

        {currentUser && (
          <div className="sidebar-user-box">
            <div>
              <div className="sidebar-user-name" title={currentUser.email}>
                {currentUser.name || 'Shop Staff'}
              </div>
              <div className="sidebar-user-role">{currentUser.email}</div>
            </div>
            <button onClick={() => handleLogout()} className="btn-logout" title="Log out of billing counter">
              <LogOut size={13} /> Log out
            </button>
          </div>
        )}

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button
            className={`nav-item ${activeTab === 'invoice' ? 'active' : ''}`}
            onClick={() => setActiveTab('invoice')}
          >
            <Receipt size={18} /> Invoices
          </button>
          <button
            className={`nav-item ${activeTab === 'purchase' ? 'active' : ''}`}
            onClick={() => setActiveTab('purchase')}
          >
            <Truck size={18} /> Purchases
          </button>
          <button
            className={`nav-item ${activeTab === 'product' ? 'active' : ''}`}
            onClick={() => setActiveTab('product')}
          >
            <Package size={18} /> Products
            {dashboardSummary?.lowStockProducts?.length > 0 && (
              <span className="nav-badge-alert" title={`${dashboardSummary.lowStockProducts.length} items low on stock`}>
                {dashboardSummary.lowStockProducts.length} low
              </span>
            )}
          </button>
          <button
            className={`nav-item ${activeTab === 'customer' ? 'active' : ''}`}
            onClick={() => setActiveTab('customer')}
          >
            <UserPlus size={18} /> Customers
          </button>
          <button
            className={`nav-item ${activeTab === 'supplier' ? 'active' : ''}`}
            onClick={() => setActiveTab('supplier')}
          >
            <Building2 size={18} /> Suppliers
          </button>
          <button
            className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <BarChart3 size={18} /> Reports
          </button>
          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} /> Settings
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        {/* Global Data Load Error Banner with Retry across all tabs */}
        {dataLoadError && activeTab !== 'dashboard' && (
          <div className="banner banner-error" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertCircle size={22} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600 }}>Error loading store data — try refreshing</div>
                <div style={{ fontSize: '0.875rem' }}>{dataLoadError}</div>
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadData} style={{ background: '#FFFFFF', whiteSpace: 'nowrap' }}>
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: DASHBOARD */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Store Dashboard</h1>
              <p className="page-subtitle">Overview of today's sales, stock levels, and recent transactions</p>
            </div>

            {/* Error Banner with Retry */}
            {dataLoadError && (
              <div className="banner banner-error" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertCircle size={22} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Couldn't load the dashboard — try refreshing</div>
                    <div style={{ fontSize: '0.875rem' }}>{dataLoadError}</div>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={loadData} style={{ background: '#FFFFFF', whiteSpace: 'nowrap' }}>
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            )}

            {/* Loading State (Never stuck spinner) */}
            {loadingInitial && !dataLoadError && (
              <div className="loading-state">
                <RefreshCw size={28} className="spin" style={{ color: 'var(--primary)', marginBottom: '12px' }} />
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Loading dashboard summary...</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Retrieving daily sales totals and inventory status</div>
              </div>
            )}

            {/* Missing Data Fallback */}
            {!loadingInitial && !dataLoadError && !dashboardSummary && (
              <div className="banner banner-warning" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertCircle size={22} style={{ flexShrink: 0 }} />
                  <span>Couldn't load dashboard summary — try refreshing</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={loadData} style={{ background: '#FFFFFF', whiteSpace: 'nowrap' }}>
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            )}

            {/* Metric Cards & Data (rendered when dashboardSummary is available) */}
            {dashboardSummary && !loadingInitial && (
              <>
                {/* Metric Cards */}
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">Today's Sales</div>
                    <div className="stat-value">₹{Number(dashboardSummary?.todaySales?.totalAmount || 0).toLocaleString('en-IN')}</div>
                    <div className="stat-hint">{dashboardSummary?.todaySales?.invoiceCount || 0} invoices created today</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Total Stock Value</div>
                    <div className="stat-value">₹{Number(dashboardSummary?.inventoryValuation || 0).toLocaleString('en-IN')}</div>
                    <div className="stat-hint">Calculated across {products.length} catalog items</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Low Stock Alerts</div>
                    <div className="stat-value" style={{ color: (dashboardSummary?.lowStockProducts?.length || 0) > 0 ? 'var(--status-warning)' : 'var(--text-primary)' }}>
                      {dashboardSummary?.lowStockProducts?.length || 0}
                    </div>
                    <div className="stat-hint">Products at or below minimum stock</div>
                  </div>
                </div>

                {/* Low Stock Warning Banner */}
                {dashboardSummary?.lowStockProducts && dashboardSummary.lowStockProducts.length > 0 && (
                  <div className="banner banner-warning">
                    <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                        {dashboardSummary.lowStockProducts.length} items are running low on stock
                      </div>
                      <div>
                        {dashboardSummary.lowStockProducts.map((p) => `${p.name} (${Number(p.currentStock)} left)`).join(', ')}
                      </div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('purchase')}>
                      Restock Now
                    </button>
                  </div>
                )}

                {/* Recent Invoices Table */}
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Recent Invoices</h2>
                    <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('invoice')}>
                      + Create New Invoice
                    </button>
                  </div>

                  {dashboardSummary?.recentInvoices && dashboardSummary.recentInvoices.length > 0 ? (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Invoice No</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th>Payment</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardSummary.recentInvoices.map((inv) => (
                            <tr key={inv.id}>
                              <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                              <td>{new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN')}</td>
                              <td>{inv.customer?.name || 'Walk-in Customer'}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(inv.billAmount).toFixed(2)}</td>
                              <td>
                                <span className="badge badge-success">{inv.paymentStatus}</span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                                    title="Download PDF invoice"
                                  >
                                    <Download size={13} /> PDF
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => openReturnModal(inv)}
                                    title="Return items from this invoice"
                                  >
                                    <RotateCcw size={13} /> Return
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-state-title">No invoices created yet</div>
                      <div className="empty-state-text">Create your first invoice to start recording daily sales.</div>
                      <button className="btn btn-primary" onClick={() => setActiveTab('invoice')}>
                        Create First Invoice
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: INVOICES (CREATE + SEARCH & PAST INVOICES + RETURNS) */}
        {/* ========================================================================= */}
        {activeTab === 'invoice' && (() => {
          const displayedInvoices = searchedInvoices !== null
            ? searchedInvoices
            : (invoiceSearchQuery.trim()
              ? invoices.filter((inv) => {
                  const q = invoiceSearchQuery.toLowerCase().trim();
                  const cleanNum = q.replace(/^inv-?/i, '');
                  const invNum = (inv.invoiceNumber || '').toLowerCase();
                  const custName = (inv.customer?.name || '').toLowerCase();
                  const custMobile = (inv.customer?.mobile || '');
                  const custGstin = (inv.customer?.gstin || '').toLowerCase();
                  return (
                    invNum.includes(q) ||
                    (cleanNum && invNum.includes(cleanNum)) ||
                    custName.includes(q) ||
                    custMobile.includes(q) ||
                    custGstin.includes(q)
                  );
                })
              : invoices);

          return (
          <div>
            {/* Header with Sub-tab Switcher */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h1 className="page-title">{invoiceSubTab === 'create' ? 'Create Sales Invoice' : 'Past Invoices Directory'}</h1>
                <p className="page-subtitle">
                  {invoiceSubTab === 'create'
                    ? 'Select customer, add products, and generate GST tax invoice'
                    : 'Search, view details, download PDFs, or process returns for past sales'}
                </p>
              </div>
              <div className="tab-pills" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`tab-pill ${invoiceSubTab === 'create' ? 'active' : ''}`}
                  onClick={() => setInvoiceSubTab('create')}
                >
                  <Plus size={15} /> Create Invoice
                </button>
                <button
                  type="button"
                  className={`tab-pill ${invoiceSubTab === 'history' ? 'active' : ''}`}
                  onClick={() => setInvoiceSubTab('history')}
                >
                  <Receipt size={15} /> Past Invoices ({invoices.length})
                </button>
              </div>
            </div>

            {/* Sub-tab 1: Create Invoice */}
            {invoiceSubTab === 'create' && (
              <div>

            {/* Saved Invoice Banner */}
            {savedInvoiceJSON && (
              <div className="banner banner-success" style={{ marginBottom: '24px' }}>
                <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Invoice {savedInvoiceJSON.invoiceNumber} saved successfully!</div>
                  <div style={{ fontSize: '0.875rem' }}>Total: ₹{savedInvoiceJSON.billAmount} | Customer: {savedInvoiceJSON.customer?.name}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    className="form-select"
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8125rem', minHeight: '34px' }}
                    value={pdfCopyType}
                    onChange={(e) => setPdfCopyType(e.target.value)}
                    title="Invoice copy designation"
                  >
                    <option value="Original">Original</option>
                    <option value="Duplicate">Duplicate</option>
                    <option value="Triplicate">Triplicate</option>
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleDownloadPdf(savedInvoiceJSON.id, savedInvoiceJSON.invoiceNumber, pdfCopyType)}
                  >
                    <Download size={14} /> Download PDF
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openReturnModal(savedInvoiceJSON)}
                  >
                    <RotateCcw size={14} /> Return Items
                  </button>
                </div>
              </div>
            )}

            <div className="card">
              {/* Step 1: Customer Selection */}
              {recentCustomers && recentCustomers.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Quick Select (Recent Customers):
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {recentCustomers.slice(0, 15).map((rc) => {
                      const isSelected = selectedCustomerId === rc.id;
                      const rcState = resolveCustomerStateCode(rc) || '24';
                      return (
                        <button
                          key={rc.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId(rc.id);
                            setTaxTypeManualOverride(false);
                          }}
                          className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ borderRadius: '20px', padding: '4px 12px', fontSize: '0.8125rem' }}
                        >
                          {rc.name}
                          {rcState !== '24' && (
                            <span style={{ marginLeft: '6px', fontSize: '0.75rem', opacity: 0.85, background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-canvas)', padding: '1px 5px', borderRadius: '10px' }}>
                              {rcState}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Select Customer</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    className="form-select"
                    value={selectedCustomerId}
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value);
                      setTaxTypeManualOverride(false);
                    }}
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.mobile ? `(${c.mobile})` : ''} {c.gstin ? `[GSTIN: ${c.gstin}]` : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-secondary" onClick={() => setActiveTab('customer')} title="Add customer">
                    <Plus size={16} /> Add Customer
                  </button>
                </div>

                {/* Selected Customer Summary & Tax Place of Supply */}
                {(() => {
                  const currentCust = customers.find((c) => c.id === selectedCustomerId);
                  if (!currentCust) return null;
                  const custState = resolveCustomerStateCode(currentCust) || (currentCust.state ? currentCust.state.trim() : '24');
                  const isInterstate = invoiceTaxType === 'INTERSTATE';

                  return (
                    <div style={{ marginTop: '12px', padding: '12px 14px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {currentCust.name} {currentCust.gstin ? <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>· GSTIN: {currentCust.gstin}</span> : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· Unregistered Customer</span>}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Place of Supply: <strong style={{ color: 'var(--text-primary)' }}>{getStateNameByCode(custState)} ({custState})</strong>
                          {currentCust.gstin && <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Derived from GSTIN prefix)</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          background: isInterstate ? '#F3E8FF' : '#E0F2FE',
                          color: isInterstate ? '#6B21A8' : '#0369A1',
                          border: `1px solid ${isInterstate ? '#D8B4FE' : '#BAE6FD'}`,
                        }}>
                          {isInterstate ? 'Inter-state (IGST 18%)' : 'Intra-state (CGST 9% + SGST 9%)'}
                        </div>
                        <select
                          className="form-select"
                          style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem', height: '30px', minHeight: '30px' }}
                          value={taxTypeManualOverride ? invoiceTaxType : 'AUTO'}
                          onChange={(e) => {
                            if (e.target.value === 'AUTO') {
                              setTaxTypeManualOverride(false);
                              const compState = getStateCodeFromGSTIN(companySettings?.gstin || '') || '24';
                              setInvoiceTaxType(custState === compState ? 'INTRASTATE' : 'INTERSTATE');
                            } else {
                              setTaxTypeManualOverride(true);
                              setInvoiceTaxType(e.target.value);
                            }
                          }}
                          title="Tax Type Override"
                        >
                          <option value="AUTO">Auto ({isInterstate ? 'IGST' : 'CGST+SGST'})</option>
                          <option value="INTRASTATE">Force Intra-state (CGST + SGST)</option>
                          <option value="INTERSTATE">Force Inter-state (IGST)</option>
                        </select>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Step 2: Add Product Line Item */}
              <div style={{ backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Add Item to Invoice</div>
                  {products.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Quick select:</span>
                      {products.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '2px 8px', height: '26px' }}
                          onClick={() => {
                            setSelectedProductId(p.id);
                            setItemQty('1');
                            setItemRate(p.sellingPrice !== undefined && p.sellingPrice !== null ? String(p.sellingPrice) : '');
                          }}
                        >
                          {p.name.replace('Absolute Magic Locker – ', '')} (₹{p.sellingPrice})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem' }}>Choose Product</label>
                    <select
                      className="form-select"
                      value={selectedProductId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setSelectedProductId(pid);
                        const p = products.find((prod) => prod.id === pid);
                        setItemRate(p && p.sellingPrice !== undefined && p.sellingPrice !== null ? String(p.sellingPrice) : '');
                      }}
                    >
                      <option value="">-- Select a product from stock --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} | Default: ₹{p.sellingPrice} | Stock: {Number(p.currentStock)} {p.unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem' }}>Quantity</label>
                    <input
                          type="number"
                          min="1"
                          className="form-input"
                          value={itemQty}
                          onChange={(e) => setItemQty(e.target.value)}
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.8125rem' }}>Unit Rate (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input"
                          value={itemRate}
                          onChange={(e) => setItemRate(e.target.value)}
                          placeholder="e.g. 200"
                          title="Selling price can be freely negotiated and edited per line"
                        />
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={handleAddItemToInvoice}>
                        <Plus size={16} /> Add Item
                      </button>
                    </div>
                  </div>

                  {/* Step 3: Items Table */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>Items on Invoice</div>
                    {invoiceItems.length > 0 ? (
                      <div className="table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Item Description</th>
                              <th>HSN/SAC Code</th>
                              <th style={{ textAlign: 'right' }}>Qty</th>
                              <th style={{ textAlign: 'right' }}>Unit Rate</th>
                              <th style={{ textAlign: 'right' }}>GST Rate</th>
                              <th style={{ textAlign: 'right' }}>Total</th>
                              <th style={{ textAlign: 'center' }}>Remove</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoiceItems.map((item, idx) => {
                              const lineAmt = (item.qty * Number(item.sellingPrice) * (1 + Number(item.gstRate) / 100)).toFixed(2);
                              return (
                                <tr key={idx}>
                                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                                  <td>{item.hsnCode}</td>
                                  <td style={{ textAlign: 'right' }}>{item.qty} {item.unit}</td>
                                  <td style={{ textAlign: 'right' }}>₹{Number(item.sellingPrice).toFixed(2)}</td>
                                  <td style={{ textAlign: 'right' }}>{item.gstRate}%</td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{lineAmt}</td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      className="btn btn-danger btn-sm"
                                      onClick={() => handleRemoveInvoiceItem(idx)}
                                      title="Remove item"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-state" style={{ padding: '32px' }}>
                        <div className="empty-state-title">No items added yet</div>
                        <div className="empty-state-text">Select a product from the list above and click "Add Item".</div>
                      </div>
                    )}
                  </div>

                  {/* Step 4: Bill Summary Box */}
                  {invoiceItems.length > 0 && (
                    <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '24px' }}>
                      <div style={{ maxWidth: '340px', marginLeft: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9375rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Price before tax:</span>
                          <span style={{ fontWeight: 600 }}>₹{liveTotals.taxableTotal}</span>
                        </div>
                        {invoiceTaxType === 'INTERSTATE' ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9375rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Integrated GST (IGST 18%):</span>
                            <span style={{ fontWeight: 600, color: '#6B21A8' }}>₹{liveTotals.igstTotal}</span>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9375rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Central GST (CGST 9%):</span>
                              <span>₹{liveTotals.cgstTotal}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9375rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>State GST (SGST 9%):</span>
                              <span>₹{liveTotals.sgstTotal}</span>
                            </div>
                          </>
                        )}
                        {Number(liveTotals.roundOff) !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            <span>Round-off:</span>
                            <span>₹{liveTotals.roundOff}</span>
                          </div>
                        )}
                        <div style={{ borderTop: '2px solid var(--border)', paddingTop: '10px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>Total Bill Amount:</span>
                          <span style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--primary)' }}>₹{liveTotals.billAmount}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Primary Action */}
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', fontSize: '1.0625rem', padding: '14px' }}
                    onClick={handleSaveInvoice}
                    disabled={creatingInvoice || invoiceItems.length === 0}
                  >
                    {creatingInvoice ? 'Saving Invoice...' : 'Save & Print Invoice'}
                  </button>
                </div>

                {/* Quick Search Past Invoices Section at bottom */}
                <div className="card" style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Quick Search Past Invoices</h2>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
                        Search any past invoice by invoice number, customer name, or phone
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setInvoiceSubTab('history')}
                    >
                      View All Past Invoices ({invoices.length}) &rarr;
                    </button>
                  </div>

                  <form onSubmit={handleSearchInvoices} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Search invoice number (e.g. 1001 or INV-1001), customer, or phone..."
                        value={invoiceSearchQuery}
                        onChange={(e) => {
                          setInvoiceSearchQuery(e.target.value);
                          if (!e.target.value.trim()) setSearchedInvoices(null);
                        }}
                      />
                      {invoiceSearchQuery && (
                        <button
                          type="button"
                          onClick={handleClearInvoiceSearch}
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                          title="Clear search"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <button type="submit" className="btn btn-secondary" disabled={searchingInvoices}>
                      <Search size={16} /> {searchingInvoices ? 'Searching...' : 'Search'}
                    </button>
                  </form>

                  {displayedInvoices.length > 0 ? (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Invoice No</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th style={{ textAlign: 'center' }}>Details</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedInvoices.slice(0, 5).map((inv) => (
                            <React.Fragment key={inv.id}>
                              <tr>
                                <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                                <td>{new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN')}</td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{inv.customer?.name || 'Walk-in Customer'}</div>
                                  {inv.customer?.mobile && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{inv.customer.mobile}</div>}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(inv.billAmount).toFixed(2)}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setExpandedInvoiceId(expandedInvoiceId === inv.id ? null : inv.id)}
                                    style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                                  >
                                    <Eye size={13} /> {expandedInvoiceId === inv.id ? 'Hide' : `${inv.items?.length || 0} items`}
                                  </button>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                                    <button
                                      className="btn btn-primary btn-sm"
                                      onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                                      title="Download PDF"
                                    >
                                      <Download size={13} /> PDF
                                    </button>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => openReturnModal(inv)}
                                      title="Return items"
                                    >
                                      <RotateCcw size={13} /> Return
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expandedInvoiceId === inv.id && (
                                <tr>
                                  <td colSpan={6} style={{ background: 'var(--bg-canvas)', padding: '12px 16px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '8px' }}>Line Items on {inv.invoiceNumber}:</div>
                                    <table className="data-table" style={{ fontSize: '0.8125rem' }}>
                                      <thead>
                                        <tr>
                                          <th>Item Description</th>
                                          <th>HSN/SAC</th>
                                          <th style={{ textAlign: 'right' }}>Qty</th>
                                          <th style={{ textAlign: 'right' }}>Rate</th>
                                          <th style={{ textAlign: 'right' }}>Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {inv.items?.map((it) => (
                                          <tr key={it.id}>
                                            <td style={{ fontWeight: 600 }}>{it.descriptionSnapshot || it.product?.name}</td>
                                            <td>{it.hsnSnapshot || it.product?.hsnCode || '-'}</td>
                                            <td style={{ textAlign: 'right' }}>{Number(it.qty)}</td>
                                            <td style={{ textAlign: 'right' }}>₹{Number(it.rate).toFixed(2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(it.amount).toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: '24px' }}>
                      <div className="empty-state-title">
                        {invoiceSearchQuery ? `No invoices found matching "${invoiceSearchQuery}"` : 'No past invoices found'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 2: Past Invoices Directory & Full Search */}
            {invoiceSubTab === 'history' && (
              <div>
                <div className="card" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
                      Search All Past Invoices
                    </h2>
                    <span className="badge badge-neutral" style={{ fontSize: '0.8125rem' }}>
                      {displayedInvoices.length} {displayedInvoices.length === 1 ? 'Invoice' : 'Invoices'} Available
                    </span>
                  </div>

                  <form onSubmit={handleSearchInvoices} style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Type invoice number (e.g. 1001, INV-1001), customer name, or phone..."
                        value={invoiceSearchQuery}
                        onChange={(e) => {
                          setInvoiceSearchQuery(e.target.value);
                          if (!e.target.value.trim()) setSearchedInvoices(null);
                        }}
                      />
                      {invoiceSearchQuery && (
                        <button
                          type="button"
                          onClick={handleClearInvoiceSearch}
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                          title="Clear search"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <button type="submit" className="btn btn-secondary" disabled={searchingInvoices}>
                      <Search size={16} /> {searchingInvoices ? 'Searching...' : 'Search'}
                    </button>
                    {invoiceSearchQuery && (
                      <button type="button" className="btn btn-secondary" onClick={handleClearInvoiceSearch}>
                        Reset
                      </button>
                    )}
                  </form>
                </div>

                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Past Invoices List</h2>
                    <button className="btn btn-primary btn-sm" onClick={() => setInvoiceSubTab('create')}>
                      <Plus size={14} /> Create New Invoice
                    </button>
                  </div>

                  {displayedInvoices.length > 0 ? (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Invoice No</th>
                            <th>Date</th>
                            <th>Customer Details</th>
                            <th>Tax Treatment</th>
                            <th style={{ textAlign: 'right' }}>Total Amount</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'center' }}>Details</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedInvoices.map((inv) => {
                            const isExpanded = expandedInvoiceId === inv.id;
                            const isInterstate = inv.taxType === 'INTERSTATE';
                            return (
                              <React.Fragment key={inv.id}>
                                <tr>
                                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{inv.invoiceNumber}</td>
                                  <td>{new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN')}</td>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{inv.customer?.name || 'Walk-in Customer'}</div>
                                    {inv.customer?.mobile && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        📞 {inv.customer.mobile}
                                      </div>
                                    )}
                                    {inv.customer?.gstin && (
                                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                        GSTIN: {inv.customer.gstin}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <span className={`badge ${isInterstate ? 'badge-warning' : 'badge-neutral'}`}>
                                      {isInterstate ? 'IGST 18%' : 'CGST+SGST 18%'}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.9375rem' }}>
                                    ₹{Number(inv.billAmount).toFixed(2)}
                                  </td>
                                  <td>
                                    <span className="badge badge-success">{inv.paymentStatus || 'PAID'}</span>
                                    {inv.returns && inv.returns.length > 0 && (
                                      <span className="badge badge-warning" style={{ marginLeft: '4px' }}>
                                        {inv.returns.length} Return{inv.returns.length > 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                    >
                                      <Eye size={13} /> {isExpanded ? 'Hide' : `${inv.items?.length || 0} items`}
                                    </button>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                      <select
                                        className="form-select"
                                        style={{ width: 'auto', padding: '2px 6px', fontSize: '0.75rem', minHeight: '30px' }}
                                        value={pdfCopyType}
                                        onChange={(e) => setPdfCopyType(e.target.value)}
                                        title="Invoice copy"
                                      >
                                        <option value="Original">Original</option>
                                        <option value="Duplicate">Duplicate</option>
                                        <option value="Triplicate">Triplicate</option>
                                      </select>
                                      <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber, pdfCopyType)}
                                        title="Download PDF Invoice"
                                      >
                                        <Download size={13} /> PDF
                                      </button>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => openReturnModal(inv)}
                                        title="Return items from this invoice"
                                      >
                                        <RotateCcw size={13} /> Return
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={8} style={{ background: 'var(--bg-canvas)', padding: '16px 20px', borderLeft: '4px solid var(--primary)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                          Line Items Breakdown for {inv.invoiceNumber} ({inv.items?.length || 0} items):
                                        </div>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                          Taxable: ₹{Number(inv.taxableTotal || 0).toFixed(2)} | GST: ₹{(Number(inv.cgstTotal || 0) + Number(inv.sgstTotal || 0) + Number(inv.igstTotal || 0)).toFixed(2)}
                                        </div>
                                      </div>
                                      <table className="data-table" style={{ fontSize: '0.8125rem' }}>
                                        <thead>
                                          <tr>
                                            <th>Item Description</th>
                                            <th>HSN/SAC Code</th>
                                            <th style={{ textAlign: 'right' }}>Quantity</th>
                                            <th style={{ textAlign: 'right' }}>Unit Rate</th>
                                            <th style={{ textAlign: 'right' }}>GST Rate</th>
                                            <th style={{ textAlign: 'right' }}>Total Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {inv.items?.map((it) => (
                                            <tr key={it.id}>
                                              <td style={{ fontWeight: 600 }}>{it.descriptionSnapshot || it.product?.name}</td>
                                              <td>{it.hsnSnapshot || it.product?.hsnCode || '-'}</td>
                                              <td style={{ textAlign: 'right' }}>{Number(it.qty)}</td>
                                              <td style={{ textAlign: 'right' }}>₹{Number(it.rate).toFixed(2)}</td>
                                              <td style={{ textAlign: 'right' }}>{it.gstRate}%</td>
                                              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(it.amount).toFixed(2)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>

                                      {inv.returns && inv.returns.length > 0 && (
                                        <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed var(--border)' }}>
                                          <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--status-warning)', marginBottom: '6px' }}>
                                            Returns Processed on this Invoice:
                                          </div>
                                          {inv.returns.map((ret) => (
                                            <div key={ret.id} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                              • {new Date(ret.createdAt).toLocaleDateString('en-IN')}: Refunded ₹{Number(ret.totalAmount).toFixed(2)} {ret.reason ? `(Reason: ${ret.reason})` : ''}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-state-title">
                        {invoiceSearchQuery ? `No invoices match "${invoiceSearchQuery}"` : 'No past invoices recorded yet'}
                      </div>
                      <div className="empty-state-text">
                        {invoiceSearchQuery
                          ? 'Try searching with a different invoice number, customer name, or phone number.'
                          : 'Invoices you create will appear here and be searchable at any time.'}
                      </div>
                      {invoiceSearchQuery ? (
                        <button className="btn btn-secondary" onClick={handleClearInvoiceSearch}>
                          Clear Search
                        </button>
                      ) : (
                        <button className="btn btn-primary" onClick={() => setInvoiceSubTab('create')}>
                          Create First Invoice
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* ========================================================================= */}
        {/* TAB 3: PURCHASES (INWARD STOCK) */}
        {/* ========================================================================= */}
        {activeTab === 'purchase' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Inward Purchases</h1>
              <p className="page-subtitle">Record stock received from suppliers to increase inventory</p>
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Record New Inward Stock</h2>

              {/* Supplier & Bill Details */}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Supplier</label>
                  <select
                    className="form-select"
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.mobile ? `(${s.mobile})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Supplier Bill / Invoice Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. SUPP-INV-9921"
                    value={purchaseRefNumber}
                    onChange={(e) => setPurchaseRefNumber(e.target.value)}
                  />
                </div>
              </div>

              {/* Add Purchase Line Item */}
              <div style={{ backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '0.9375rem' }}>Add Product to Purchase Order</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem' }}>Product</label>
                    <select
                      className="form-select"
                      value={purchaseProdId}
                      onChange={(e) => {
                        setPurchaseProdId(e.target.value);
                        const p = products.find((x) => x.id === e.target.value);
                        if (p) setPurchaseRate(p.purchasePrice);
                      }}
                    >
                      <option value="">-- Choose product --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Current: {Number(p.currentStock)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem' }}>Quantity</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={purchaseQty}
                      onChange={(e) => setPurchaseQty(e.target.value)}
                      placeholder="Qty"
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem' }}>Purchase Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={purchaseRate}
                      onChange={(e) => setPurchaseRate(e.target.value)}
                      placeholder="Rate"
                    />
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={handleAddPurchaseItem}>
                    <Plus size={16} /> Add Line
                  </button>
                </div>
              </div>

              {/* Purchase Items Table */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px' }}>Items to Restock</div>
                {purchaseItems.length > 0 ? (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>HSN/SAC Code</th>
                          <th style={{ textAlign: 'right' }}>Qty</th>
                          <th style={{ textAlign: 'right' }}>Purchase Rate</th>
                          <th style={{ textAlign: 'right' }}>GST Rate</th>
                          <th style={{ textAlign: 'right' }}>Total</th>
                          <th style={{ textAlign: 'center' }}>Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseItems.map((it, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600 }}>{it.name}</td>
                            <td>{it.hsnCode}</td>
                            <td style={{ textAlign: 'right' }}>{it.qty}</td>
                            <td style={{ textAlign: 'right' }}>₹{Number(it.rate).toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>{it.gstRate}%</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{it.total.toFixed(2)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => setPurchaseItems(purchaseItems.filter((_, i) => i !== idx))}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: '32px' }}>
                    <div className="empty-state-title">No products added to this purchase yet</div>
                    <div className="empty-state-text">Select a product and rate above to add inward stock.</div>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleSavePurchase}
                disabled={creatingPurchase || purchaseItems.length === 0}
              >
                {creatingPurchase ? 'Recording stock...' : 'Record Purchase & Increase Stock'}
              </button>
            </div>

            {/* Inward Purchases History */}
            <div className="card">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Past Inward Stock Purchases</h2>
              {purchases.length > 0 ? (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>Bill Reference</th>
                        <th>Items Count</th>
                        <th style={{ textAlign: 'right' }}>Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((pu) => (
                        <tr key={pu.id}>
                          <td>{new Date(pu.purchaseDate || pu.createdAt).toLocaleDateString('en-IN')}</td>
                          <td style={{ fontWeight: 600 }}>{pu.supplier?.name}</td>
                          <td>{pu.referenceNumber}</td>
                          <td>{pu.items?.length || 0} items</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(pu.totalAmount).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-title">No purchases recorded yet</div>
                  <div className="empty-state-text">Record your first supplier purchase order above.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: PRODUCTS */}
        {/* ========================================================================= */}
        {activeTab === 'product' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Product Inventory</h1>
              <p className="page-subtitle">Manage items, tax rates, selling prices, and stock counts</p>
            </div>

            {/* Add Product Form */}
            <div className="card" style={{ maxWidth: '680px' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Add Product to Inventory</h2>
              <form onSubmit={handleCreateProduct}>
                <div className="form-group">
                  <label className="form-label">Product Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Havells 2.5 sq mm Copper Wire 90m"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">HSN/SAC Code</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 998314"
                      value={productForm.hsnCode}
                      onChange={(e) => setProductForm({ ...productForm, hsnCode: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">GST Tax Rate (%)</label>
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

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Purchase Cost (₹)</label>
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
                    <label className="form-label">Selling Price (₹)</label>
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
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Starting Stock Count</label>
                    <input
                      type="number"
                      className="form-input"
                      value={productForm.openingStock}
                      onChange={(e) => setProductForm({ ...productForm, openingStock: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Alert Below <span className="form-label-optional">(optional)</span>
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      value={productForm.minStockLevel}
                      onChange={(e) => setProductForm({ ...productForm, minStockLevel: e.target.value })}
                    />
                    <span className="form-hint">Warns when stock falls to this number</span>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={creatingProduct}>
                  {creatingProduct ? 'Saving...' : 'Add Product to Catalog'}
                </button>
              </form>
            </div>

            {/* Products Table */}
            <div className="card">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Current Product Catalog</h2>
              {products.length > 0 ? (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>HSN/SAC Code</th>
                        <th>GST</th>
                        <th style={{ textAlign: 'right' }}>Cost</th>
                        <th style={{ textAlign: 'right' }}>Selling Price</th>
                        <th style={{ textAlign: 'right' }}>Current Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => {
                        const isLow = Number(p.currentStock) <= Number(p.minStockLevel || 0);
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600 }}>{p.name}</td>
                            <td>{p.hsnCode}</td>
                            <td>{p.gstRate}%</td>
                            <td style={{ textAlign: 'right' }}>₹{Number(p.purchasePrice).toFixed(2)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(p.sellingPrice).toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <span className={`badge ${isLow ? 'badge-warning' : 'badge-neutral'}`}>
                                {Number(p.currentStock)} {p.unit}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-title">No products in inventory yet</div>
                  <div className="empty-state-text">Add your first product above to begin billing.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: CUSTOMERS */}
        {/* ========================================================================= */}
        {activeTab === 'customer' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Customer Directory</h1>
              <p className="page-subtitle">Save customer billing details and GSTIN records</p>
            </div>

            <div className="card" style={{ maxWidth: '640px' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Add New Customer</h2>
              <form onSubmit={handleCreateCustomer}>
                <div className="form-group">
                  <label className="form-label">Customer Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Sharma Hardware"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Mobile Number <span className="form-label-optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. +91 98000 00000"
                    value={customerForm.mobile}
                    onChange={(e) => setCustomerForm({ ...customerForm, mobile: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Billing Address <span className="form-label-optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Shop address or city"
                    value={customerForm.address}
                    onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    GSTIN <span className="form-label-optional">(optional, if registered business)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 24AAAAA0000A1Z5"
                    value={customerForm.gstin}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      const detectedState = getStateCodeFromGSTIN(val);
                      setCustomerForm({
                        ...customerForm,
                        gstin: val,
                        ...(detectedState ? { state: detectedState } : {}),
                      });
                    }}
                  />
                  <span className="form-hint">Leave blank for regular retail consumers. Auto-detects state code prefix.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    State / Place of Supply <span className="form-label-optional">(GST State Code)</span>
                  </label>
                  <select
                    className="form-select"
                    value={customerForm.state || '24'}
                    onChange={(e) => setCustomerForm({ ...customerForm, state: e.target.value })}
                  >
                    {Object.entries(INDIAN_STATES).map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                  <span className="form-hint">Clean 2-digit GST state code. Defaults to 24 (Gujarat).</span>
                </div>

                <button type="submit" className="btn btn-primary" disabled={creatingCustomer}>
                  {creatingCustomer ? 'Saving...' : 'Add Customer'}
                </button>
              </form>
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Saved Customers</h2>
              {customers.length > 0 ? (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>State / Place of Supply</th>
                        <th>GSTIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => {
                        const code = resolveCustomerStateCode(c) || '24';
                        return (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.name}</td>
                            <td>{c.mobile || '—'}</td>
                            <td>
                              <span style={{ fontWeight: 500 }}>{getStateNameByCode(code)}</span>{' '}
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>({code})</span>
                            </td>
                            <td>{c.gstin || <span style={{ color: 'var(--text-muted)' }}>Consumer</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-title">No customers added yet</div>
                  <div className="empty-state-text">Add your first customer to bill them directly.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: SUPPLIERS */}
        {/* ========================================================================= */}
        {activeTab === 'supplier' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Suppliers</h1>
              <p className="page-subtitle">Manage wholesale suppliers, phone numbers, and GSTIN details</p>
            </div>

            <div className="card" style={{ maxWidth: '640px' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Add New Supplier</h2>
              <form onSubmit={handleCreateSupplier}>
                <div className="form-group">
                  <label className="form-label">Supplier Business Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Gujarat Electrical Distributors"
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      Phone Number <span className="form-label-optional">(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. +91 98250 12345"
                      value={supplierForm.mobile}
                      onChange={(e) => setSupplierForm({ ...supplierForm, mobile: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      GSTIN <span className="form-label-optional">(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="24AABCE1234F1Z1"
                      value={supplierForm.gstin}
                      onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Address <span className="form-label-optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="City or warehouse location"
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={creatingSupplier}>
                  {creatingSupplier ? 'Saving...' : 'Add Supplier'}
                </button>
              </form>
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Supplier Directory</h2>
              {suppliers.length > 0 ? (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Supplier Name</th>
                        <th>Phone</th>
                        <th>Address</th>
                        <th>GSTIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td>{s.mobile || '—'}</td>
                          <td>{s.address || '—'}</td>
                          <td>{s.gstin || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-title">No suppliers added yet</div>
                  <div className="empty-state-text">Add your suppliers above to record inward purchases.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: REPORTS */}
        {/* ========================================================================= */}
        {activeTab === 'reports' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Store Reports</h1>
              <p className="page-subtitle">Simple, plain-language summaries for sales, inward purchases, and stock</p>
            </div>

            {/* Report Error Banner */}
            {reportError && (
              <div className="banner banner-error" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertCircle size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Couldn't load report data — try refreshing</div>
                    <div style={{ fontSize: '0.875rem' }}>{reportError}</div>
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={loadReport} style={{ background: '#FFFFFF', whiteSpace: 'nowrap' }}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            )}

            {/* Report Loading State */}
            {loadingReport && (
              <div className="loading-state">
                <RefreshCw size={24} className="spin" style={{ color: 'var(--primary)', marginBottom: '8px' }} />
                <div style={{ fontWeight: 600 }}>Loading report data...</div>
              </div>
            )}
            {/* Sub-tab Switcher */}
            <div className="tab-pills">
              <button
                className={`tab-pill ${reportSubTab === 'sales' ? 'active' : ''}`}
                onClick={() => setReportSubTab('sales')}
              >
                Sales Summary
              </button>
              <button
                className={`tab-pill ${reportSubTab === 'purchases' ? 'active' : ''}`}
                onClick={() => setReportSubTab('purchases')}
              >
                Purchases Summary
              </button>
              <button
                className={`tab-pill ${reportSubTab === 'stock' ? 'active' : ''}`}
                onClick={() => setReportSubTab('stock')}
              >
                Stock Valuation
              </button>
            </div>

            {/* Date Filters (for sales and purchases) */}
            {reportSubTab !== 'stock' && (
              <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem' }}>From Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={reportFromDate}
                      onChange={(e) => setReportFromDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8125rem' }}>To Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={reportToDate}
                      onChange={(e) => setReportToDate(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={loadReport} disabled={loadingReport}>
                    <RefreshCw size={14} className={loadingReport ? 'spin' : ''} /> Filter Report
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setReportFromDate(''); setReportToDate(''); }}
                  >
                    Clear Filter
                  </button>
                </div>
              </div>
            )}

            {/* Sub-tab 1: Sales Report */}
            {reportSubTab === 'sales' && salesReportData && (
              <div>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div className="stat-card">
                    <div className="stat-label">Total Sales In Period</div>
                    <div className="stat-value">₹{Number(salesReportData.summary?.totalSales || 0).toLocaleString('en-IN')}</div>
                    <div className="stat-hint">{salesReportData.summary?.invoiceCount || 0} invoices generated</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Taxable Value</div>
                    <div className="stat-value">₹{Number(salesReportData.summary?.taxableTotal || 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Intra-state GST (CGST+SGST)</div>
                    <div className="stat-value">
                      ₹{(Number(salesReportData.summary?.cgstTotal || 0) + Number(salesReportData.summary?.sgstTotal || 0)).toLocaleString('en-IN')}
                    </div>
                    <div className="stat-hint">CGST: ₹{salesReportData.summary?.cgstTotal} | SGST: ₹{salesReportData.summary?.sgstTotal}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Inter-state IGST</div>
                    <div className="stat-value" style={{ color: '#6B21A8' }}>
                      ₹{Number(salesReportData.summary?.igstTotal || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="stat-hint">Integrated GST (Inter-state)</div>
                  </div>
                </div>

                <div className="card">
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Invoice List</h2>
                  {salesReportData.invoices && salesReportData.invoices.length > 0 ? (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Invoice No</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Tax Type</th>
                            <th style={{ textAlign: 'right' }}>Taxable</th>
                            <th style={{ textAlign: 'right' }}>CGST+SGST</th>
                            <th style={{ textAlign: 'right' }}>IGST</th>
                            <th style={{ textAlign: 'right' }}>Bill Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesReportData.invoices.map((inv) => {
                            const isInterstate = inv.taxType === 'INTERSTATE';
                            return (
                              <tr key={inv.id}>
                                <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                                <td>{new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN')}</td>
                                <td>{inv.customer?.name}</td>
                                <td>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    background: isInterstate ? '#F3E8FF' : '#E0F2FE',
                                    color: isInterstate ? '#6B21A8' : '#0369A1',
                                  }}>
                                    {isInterstate ? 'Inter-state' : 'Intra-state'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>₹{Number(inv.taxableTotal).toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>
                                  {isInterstate ? '—' : `₹${(Number(inv.cgstTotal) + Number(inv.sgstTotal)).toFixed(2)}`}
                                </td>
                                <td style={{ textAlign: 'right', color: isInterstate ? '#6B21A8' : undefined, fontWeight: isInterstate ? 600 : 400 }}>
                                  {isInterstate ? `₹${Number(inv.igstTotal || 0).toFixed(2)}` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(inv.billAmount).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-state-title">No invoices found for this date range</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 2: Purchases Report */}
            {reportSubTab === 'purchases' && purchasesReportData && (
              <div>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">Total Inward Purchases</div>
                    <div className="stat-value">₹{Number(purchasesReportData.summary?.totalPurchases || 0).toLocaleString('en-IN')}</div>
                    <div className="stat-hint">{purchasesReportData.summary?.purchaseCount || 0} purchase orders</div>
                  </div>
                </div>

                <div className="card">
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Purchases List</h2>
                  {purchasesReportData.purchases && purchasesReportData.purchases.length > 0 ? (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Supplier</th>
                            <th>Reference Bill #</th>
                            <th>Items Count</th>
                            <th style={{ textAlign: 'right' }}>Total Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchasesReportData.purchases.map((p) => (
                            <tr key={p.id}>
                              <td>{new Date(p.purchaseDate || p.createdAt).toLocaleDateString('en-IN')}</td>
                              <td style={{ fontWeight: 600 }}>{p.supplier?.name}</td>
                              <td>{p.referenceNumber}</td>
                              <td>{p.items?.length || 0} items</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(p.totalAmount).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-state-title">No purchases found for this date range</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-tab 3: Stock Valuation Report */}
            {reportSubTab === 'stock' && stockReportData && (() => {
              const productsList = stockReportData.products || stockReportData.items || [];
              const totalVal = stockReportData.totalValuation ?? stockReportData.summary?.totalStockValue ?? 0;
              return (
                <div>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-label">Total Inventory Valuation</div>
                      <div className="stat-value">
                        ₹{Number(totalVal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="stat-hint">Across {productsList.length} items</div>
                    </div>
                  </div>

                  <div className="card">
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '16px' }}>Stock Inventory Details</h2>
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>HSN/SAC Code</th>
                            <th style={{ textAlign: 'right' }}>Cost Price</th>
                            <th style={{ textAlign: 'right' }}>Selling Price</th>
                            <th style={{ textAlign: 'right' }}>Current Stock</th>
                            <th style={{ textAlign: 'right' }}>Stock Valuation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productsList.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                                No products found.
                              </td>
                            </tr>
                          ) : (
                            productsList.map((p) => {
                              const isLow = Number(p.currentStock) <= Number(p.minStockLevel || 0);
                              const valuation = p.lineValuation ?? p.stockValue ?? (Number(p.currentStock) * Number(p.purchasePrice || 0));
                              return (
                                <tr key={p.id}>
                                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                                  <td>{p.hsnCode || '-'}</td>
                                  <td style={{ textAlign: 'right' }}>₹{Number(p.purchasePrice || 0).toFixed(2)}</td>
                                  <td style={{ textAlign: 'right' }}>₹{Number(p.sellingPrice || 0).toFixed(2)}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <span className={`badge ${isLow ? 'badge-warning' : 'badge-neutral'}`}>
                                      {Number(p.currentStock)} {p.unit || 'PCS'}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{Number(valuation).toFixed(2)}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 8: SETTINGS */}
        {/* ========================================================================= */}
        {activeTab === 'settings' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Store & Invoice Settings</h1>
              <p className="page-subtitle">Configure business name, address, GSTIN, and terms printed on A4 PDF invoices</p>
            </div>

            <div className="card" style={{ maxWidth: '680px' }}>
              {/* Company Logo Section */}
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Company Logo (PDF & UI Branding)</label>
                <div className="logo-upload-card">
                  <div className="logo-preview-box">
                    {companySettings.logoUrl ? (
                      <img
                        src={companySettings.logoUrl}
                        alt="Company Logo"
                        className="logo-preview-img"
                      />
                    ) : (
                      <div className="logo-empty-text">No logo set (text fallback)</div>
                    )}
                  </div>
                  <div className="logo-actions">
                    <input
                      type="file"
                      ref={logoInputRef}
                      accept="image/png, image/jpeg, image/jpg"
                      className="logo-file-input"
                      onChange={handleLogoFileChange}
                    />
                    <div className="logo-actions-row">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        <Upload size={15} /> {companySettings.logoUrl ? 'Change Logo' : 'Upload Logo'}
                      </button>
                      {companySettings.logoUrl && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '8px 12px' }}
                          onClick={handleRemoveLogo}
                          disabled={uploadingLogo}
                        >
                          <Trash2 size={15} /> Remove Logo
                        </button>
                      )}
                    </div>
                    <span className="form-hint" style={{ marginTop: '4px' }}>
                      Transparent PNG or JPG (max 5MB). Displayed on invoice PDF header, sidebar, and login screen.
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveSettings}>
                <div className="form-group">
                  <label className="form-label">Business / Shop Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={companySettings.name || ''}
                    onChange={(e) => setCompanySettings({ ...companySettings, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Shop Address</label>
                  <input
                    type="text"
                    className="form-input"
                    value={companySettings.address || ''}
                    onChange={(e) => setCompanySettings({ ...companySettings, address: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
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
                </div>

                <div className="form-group">
                  <label className="form-label">
                    PAN Number <span className="form-label-optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={companySettings.pan || ''}
                    onChange={(e) => setCompanySettings({ ...companySettings, pan: e.target.value.toUpperCase() })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Invoice Terms & Conditions (English)</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={companySettings.terms || ''}
                    onChange={(e) => setCompanySettings({ ...companySettings, terms: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Gujarati Terms & Conditions (Printed on PDF)</label>
                  <textarea
                    className="form-input"
                    rows="6"
                    style={{ lineHeight: '1.6' }}
                    value={companySettings.termsGujarati || ''}
                    onChange={(e) => setCompanySettings({ ...companySettings, termsGujarati: e.target.value })}
                    placeholder="શરતો અને નિયમો..."
                  />
                  <span className="form-hint">
                    Printed in terms box on PDF using bundled Noto Sans Gujarati Unicode font.
                  </span>
                </div>

                <button type="submit" className="btn btn-primary" disabled={savingSettings}>
                  {savingSettings ? 'Saving details...' : 'Save Company Details'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL: SALES RETURN & RESTOCK */}
      {/* ========================================================================= */}
      {returnModalInvoice && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <div className="modal-title">Return Items to Stock</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Invoice: {returnModalInvoice.invoiceNumber} | Customer: {returnModalInvoice.customer?.name}
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setReturnModalInvoice(null)}
                style={{ border: 'none' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitSalesReturn}>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Enter the quantity being returned for each item. Returned stock is automatically added back to inventory.
                </p>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ textAlign: 'right' }}>Sold</th>
                        <th style={{ textAlign: 'right' }}>Already Returned</th>
                        <th style={{ textAlign: 'right' }}>Return Now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnModalInvoice.items?.map((item) => {
                        const maxAllowed = Number(item.qty) - Number(item.alreadyReturnedQty || 0);
                        return (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600 }}>{item.descriptionSnapshot}</td>
                            <td style={{ textAlign: 'right' }}>{Number(item.qty)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {Number(item.alreadyReturnedQty || 0)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number"
                                min="0"
                                max={maxAllowed}
                                step="1"
                                className="form-input"
                                style={{ width: '80px', textAlign: 'right', padding: '6px 8px', minHeight: '36px' }}
                                value={returnQuantities[item.id] || '0'}
                                onChange={(e) =>
                                  setReturnQuantities({
                                    ...returnQuantities,
                                    [item.id]: e.target.value,
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Return Reason <span className="form-label-optional">(optional)</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Customer changed mind, defective item"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReturnModalInvoice(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingReturn}
                >
                  {submittingReturn ? 'Processing...' : 'Confirm Return & Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MANDATORY PASSWORD CHANGE */}
      {/* ========================================================================= */}
      {showPasswordChangeModal && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                  <Lock size={20} />
                  Change Password Required
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  For security, you must update your password before accessing the billing system.
                </div>
              </div>
            </div>

            <form onSubmit={handlePasswordChange} style={{ marginTop: '16px' }}>
              {passwordChangeError && (
                <div className="alert alert-danger" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} />
                  <span>{passwordChangeError}</span>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-input"
                  required
                  placeholder="Enter current password"
                  value={passwordChangeForm.currentPassword}
                  onChange={(e) => setPasswordChangeForm({ ...passwordChangeForm, currentPassword: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label">New Password (min 8 characters)</label>
                <input
                  type="password"
                  className="form-input"
                  required
                  minLength={8}
                  placeholder="Enter new password"
                  value={passwordChangeForm.newPassword}
                  onChange={(e) => setPasswordChangeForm({ ...passwordChangeForm, newPassword: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="form-input"
                  required
                  placeholder="Repeat new password"
                  value={passwordChangeForm.confirmPassword}
                  onChange={(e) => setPasswordChangeForm({ ...passwordChangeForm, confirmPassword: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleLogout('Password change was cancelled. Please log in again.')}
                >
                  <LogOut size={16} /> Log Out
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={passwordChangeLoading}
                >
                  {passwordChangeLoading ? 'Updating...' : 'Set New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
