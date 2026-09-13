import { Router } from 'express';
import prisma from '../db.js';
import { getStateCodeFromGSTIN, isValidStateCode } from '../utils/gstStates.js';

const router = Router();

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
// Ordered so customers with recent invoices come first, followed by others alphabetically
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

    // Strict state precedence:
    // 1. If valid GSTIN, extract 2-digit state code from GSTIN
    // 2. Else use manual state (clean 2-digit code)
    // 3. Fallback: default to "24" (Gujarat)
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
      cleanState = '24'; // Default to Gujarat for local unregistered counter customers
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
        // GSTIN wins if valid, otherwise update manual state
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

export default router;
