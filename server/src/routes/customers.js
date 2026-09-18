import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { getStateCodeFromGSTIN, isValidStateCode } from '../utils/gstStates.js';

const router = Router();
const Decimal = Prisma.Decimal;

// GET /customers/recent - list up to 15 most recently invoiced distinct customers
router.get('/recent', async (req, res) => {
  try {
    const recentInvoices = await prisma.invoice.findMany({
      orderBy: { invoiceDate: 'desc' },
      distinct: ['customerId'],
      take: 15,
      select: {
        invoiceDate: true,
        customer: true,
      },
    });

    const recentCustomers = recentInvoices
      .filter((inv) => Boolean(inv.customer))
      .map((inv) => ({
        ...inv.customer,
        lastInvoicedAt: inv.invoiceDate,
      }));

    res.json(recentCustomers);
  } catch (error) {
    console.error('Error fetching recent customers:', error);
    res.status(500).json({ error: 'Failed to fetch recent customers', details: error.message });
  }
});

// GET /customers - list customers for frontend selection
router.get('/', async (req, res) => {
  try {
    const allCustomers = await prisma.customer.findMany({
      include: {
        invoices: {
          select: { invoiceDate: true },
          orderBy: { invoiceDate: 'desc' },
          take: 1,
        },
      },
    });

    const formatted = allCustomers.map((c) => {
      const lastInvoicedAt = c.invoices && c.invoices.length > 0 ? c.invoices[0].invoiceDate : null;
      const { invoices, ...rest } = c;
      return {
        ...rest,
        lastInvoicedAt,
      };
    });

    // Sort: most recently invoiced first, then newer created, then alphabetical
    formatted.sort((a, b) => {
      if (a.lastInvoicedAt && b.lastInvoicedAt) {
        return new Date(b.lastInvoicedAt) - new Date(a.lastInvoicedAt);
      }
      if (a.lastInvoicedAt) return -1;
      if (b.lastInvoicedAt) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers', details: error.message });
  }
});

// POST /customers - Create Customer (name, mobile, address, gstin, state)
router.post('/', async (req, res) => {
  try {
    const { name, mobile, address, gstin, state } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const cleanGstin = gstin && gstin.trim() ? gstin.trim().toUpperCase() : null;

    let cleanState = null;
    if (cleanGstin) {
      cleanState = getStateCodeFromGSTIN(cleanGstin);
    }
    if (!cleanState && state && state.trim()) {
      const code = state.trim();
      if (isValidStateCode(code)) {
        cleanState = code;
      }
    }
    if (!cleanState) {
      cleanState = '24'; // Default to Gujarat
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        mobile: mobile ? mobile.trim() : null,
        address: address ? address.trim() : null,
        gstin: cleanGstin,
        state: cleanState,
      },
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer', details: error.message });
  }
});

// PUT /customers/:id - Update Customer (name, mobile, address, gstin, state)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile, address, gstin, state } = req.body;

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const cleanGstin = gstin !== undefined ? (gstin && gstin.trim() ? gstin.trim().toUpperCase() : null) : existing.gstin;

    let cleanState = existing.state;
    if (cleanGstin) {
      cleanState = getStateCodeFromGSTIN(cleanGstin) || cleanState;
    }
    if (state !== undefined && state && state.trim()) {
      const code = state.trim();
      if (isValidStateCode(code)) {
        if (!cleanGstin || !getStateCodeFromGSTIN(cleanGstin)) {
          cleanState = code;
        }
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : existing.name,
        mobile: mobile !== undefined ? (mobile ? mobile.trim() : null) : existing.mobile,
        address: address !== undefined ? (address ? address.trim() : null) : existing.address,
        gstin: cleanGstin,
        state: cleanState,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer', details: error.message });
  }
});

// GET /customers/:id/ledger - Detailed customer ledger and statement of accounts
router.get('/:id/ledger', async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Fetch non-cancelled invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        customerId: id,
        status: { not: 'CANCELLED' },
      },
      orderBy: { invoiceDate: 'asc' },
      include: {
        items: {
          select: {
            id: true,
            descriptionSnapshot: true,
            qty: true,
            rate: true,
            amount: true,
          },
        },
      },
    });

    const invoiceIds = invoices.map((inv) => inv.id);

    // Fetch payments for these invoices
    const payments = await prisma.payment.findMany({
      where: {
        entityType: 'INVOICE',
        entityId: { in: invoiceIds },
      },
      orderBy: { paymentDate: 'asc' },
    });

    // Map payments to invoices
    const paymentsByInvoice = new Map();
    for (const p of payments) {
      if (!paymentsByInvoice.has(p.entityId)) {
        paymentsByInvoice.set(p.entityId, []);
      }
      paymentsByInvoice.get(p.entityId).push(p);
    }

    let totalBilled = new Decimal(0);
    let totalPaid = new Decimal(0);
    let totalOutstanding = new Decimal(0);

    const formattedInvoices = invoices.map((inv) => {
      const billAmount = new Decimal(inv.billAmount);
      const paidAmount = new Decimal(inv.paidAmount || 0);
      const outstanding = Decimal.max(0, billAmount.minus(paidAmount));

      totalBilled = totalBilled.plus(billAmount);
      totalPaid = totalPaid.plus(paidAmount);
      totalOutstanding = totalOutstanding.plus(outstanding);

      return {
        ...inv,
        billAmount: billAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        outstanding: outstanding.toFixed(2),
        payments: paymentsByInvoice.get(inv.id) || [],
      };
    });

    // Build unified chronological ledger transactions
    const rawTransactions = [];

    for (const inv of invoices) {
      rawTransactions.push({
        id: `INV-${inv.id}`,
        entityId: inv.id,
        date: inv.invoiceDate,
        type: 'INVOICE',
        reference: inv.invoiceNumber,
        description: `Invoice #${inv.invoiceNumber}`,
        debit: new Decimal(inv.billAmount).toFixed(2),
        credit: '0.00',
        status: inv.status,
      });
    }

    for (const pmt of payments) {
      const inv = invoices.find((i) => i.id === pmt.entityId);
      const invNum = inv ? inv.invoiceNumber : '';
      const isVoided = pmt.status === 'VOIDED';

      rawTransactions.push({
        id: `PMT-${pmt.id}`,
        entityId: pmt.entityId,
        paymentId: pmt.id,
        date: pmt.paymentDate,
        type: isVoided ? 'VOIDED_PAYMENT' : 'PAYMENT',
        reference: invNum,
        description: isVoided
          ? `Voided Payment (${pmt.paymentMethod}) - Reason: ${pmt.voidReason || 'N/A'}`
          : `Payment via ${pmt.paymentMethod}${pmt.notes ? ' (' + pmt.notes + ')' : ''}`,
        debit: '0.00',
        credit: isVoided ? '0.00' : new Decimal(pmt.amount).toFixed(2),
        paymentMethod: pmt.paymentMethod,
        notes: pmt.notes,
        status: pmt.status,
        voidReason: pmt.voidReason,
        voidedAt: pmt.voidedAt,
      });
    }

    // Sort transactions by date ascending, then invoices before payments on same timestamp
    rawTransactions.sort((a, b) => {
      const diff = new Date(a.date) - new Date(b.date);
      if (diff !== 0) return diff;
      if (a.type === 'INVOICE' && b.type !== 'INVOICE') return -1;
      if (a.type !== 'INVOICE' && b.type === 'INVOICE') return 1;
      return 0;
    });

    // Compute running balance
    let runningBalance = new Decimal(0);
    const transactions = rawTransactions.map((tx) => {
      runningBalance = runningBalance.plus(new Decimal(tx.debit)).minus(new Decimal(tx.credit));
      return {
        ...tx,
        balance: runningBalance.toFixed(2),
      };
    });

    res.json({
      customer,
      invoices: formattedInvoices,
      transactions,
      summary: {
        totalInvoiced: totalBilled.toFixed(2),
        totalBilled: totalBilled.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        currentBalance: totalOutstanding.toFixed(2),
        totalOutstanding: totalOutstanding.toFixed(2),
        invoiceCount: formattedInvoices.length,
        unpaidCount: formattedInvoices.filter((i) => i.paymentStatus !== 'PAID').length,
      },
    });
  } catch (error) {
    console.error('Error fetching customer ledger:', error);
    res.status(500).json({ error: 'Failed to fetch customer ledger', details: error.message });
  }
});

export default router;
