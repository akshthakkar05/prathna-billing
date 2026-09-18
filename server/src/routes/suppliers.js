import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();
const Decimal = Prisma.Decimal;

// GET /suppliers - list all suppliers
router.get('/', async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });
    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers', details: error.message });
  }
});

// GET /suppliers/:id - get supplier with purchases
router.get('/:id', async (req, res) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        purchases: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch supplier', details: error.message });
  }
});

// POST /suppliers - Create Supplier
router.post('/', async (req, res) => {
  try {
    const { name, mobile, address, gstin, pan, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: name.trim(),
        mobile: mobile ? mobile.trim() : null,
        address: address ? address.trim() : null,
        gstin: gstin ? gstin.trim().toUpperCase() : null,
        pan: pan ? pan.trim().toUpperCase() : null,
        notes: notes ? notes.trim() : null,
      },
    });

    res.status(201).json(supplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: 'Failed to create supplier', details: error.message });
  }
});

// GET /suppliers/:id/ledger - Detailed supplier ledger and payables statement
router.get('/:id/ledger', async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({
      where: { id },
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Fetch non-cancelled purchases
    const purchases = await prisma.purchase.findMany({
      where: {
        supplierId: id,
        status: { not: 'CANCELLED' },
      },
      orderBy: { purchaseDate: 'asc' },
      include: {
        items: {
          select: {
            id: true,
            product: { select: { name: true } },
            qty: true,
            rate: true,
            amount: true,
            isInclusive: true,
          },
        },
      },
    });

    const purchaseIds = purchases.map((p) => p.id);

    // Fetch payments for these purchases
    const payments = await prisma.payment.findMany({
      where: {
        entityType: 'PURCHASE',
        entityId: { in: purchaseIds },
      },
      orderBy: { paymentDate: 'asc' },
    });

    const paymentsByPurchase = new Map();
    for (const p of payments) {
      if (!paymentsByPurchase.has(p.entityId)) {
        paymentsByPurchase.set(p.entityId, []);
      }
      paymentsByPurchase.get(p.entityId).push(p);
    }

    let totalPurchased = new Decimal(0);
    let totalPaid = new Decimal(0);
    let totalOutstanding = new Decimal(0);

    const formattedPurchases = purchases.map((pur) => {
      const totalAmount = new Decimal(pur.totalAmount);
      const paidAmount = new Decimal(pur.paidAmount || 0);
      const outstanding = Decimal.max(0, totalAmount.minus(paidAmount));

      totalPurchased = totalPurchased.plus(totalAmount);
      totalPaid = totalPaid.plus(paidAmount);
      totalOutstanding = totalOutstanding.plus(outstanding);

      return {
        ...pur,
        totalAmount: totalAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        outstanding: outstanding.toFixed(2),
        payments: paymentsByPurchase.get(pur.id) || [],
      };
    });

    // Build unified chronological ledger transactions
    const rawTransactions = [];

    for (const pur of purchases) {
      rawTransactions.push({
        id: `PUR-${pur.id}`,
        entityId: pur.id,
        date: pur.purchaseDate,
        type: 'PURCHASE',
        reference: pur.referenceNumber || `PUR-${pur.id.slice(-6)}`,
        description: `Purchase Bill ${pur.referenceNumber ? '#' + pur.referenceNumber : ''}`,
        credit: new Decimal(pur.totalAmount).toFixed(2), // We owe supplier (credit liability)
        debit: '0.00',
        status: pur.status,
      });
    }

    for (const pmt of payments) {
      const pur = purchases.find((p) => p.id === pmt.entityId);
      const refNum = pur ? pur.referenceNumber || '' : '';
      const isVoided = pmt.status === 'VOIDED';

      rawTransactions.push({
        id: `PMT-${pmt.id}`,
        entityId: pmt.entityId,
        paymentId: pmt.id,
        date: pmt.paymentDate,
        type: isVoided ? 'VOIDED_PAYMENT' : 'PAYMENT',
        reference: refNum,
        description: isVoided
          ? `Voided Payment (${pmt.paymentMethod}) - Reason: ${pmt.voidReason || 'N/A'}`
          : `Payment via ${pmt.paymentMethod}${pmt.notes ? ' (' + pmt.notes + ')' : ''}`,
        debit: isVoided ? '0.00' : new Decimal(pmt.amount).toFixed(2), // Payment reduces supplier balance (debit)
        credit: '0.00',
        paymentMethod: pmt.paymentMethod,
        notes: pmt.notes,
        status: pmt.status,
        voidReason: pmt.voidReason,
        voidedAt: pmt.voidedAt,
      });
    }

    rawTransactions.sort((a, b) => {
      const diff = new Date(a.date) - new Date(b.date);
      if (diff !== 0) return diff;
      if (a.type === 'PURCHASE' && b.type !== 'PURCHASE') return -1;
      if (a.type !== 'PURCHASE' && b.type === 'PURCHASE') return 1;
      return 0;
    });

    let runningBalance = new Decimal(0);
    const transactions = rawTransactions.map((tx) => {
      runningBalance = runningBalance.plus(new Decimal(tx.credit)).minus(new Decimal(tx.debit));
      return {
        ...tx,
        balance: runningBalance.toFixed(2),
      };
    });

    res.json({
      supplier,
      purchases: formattedPurchases,
      transactions,
      summary: {
        totalPurchased: totalPurchased.toFixed(2),
        totalBilled: totalPurchased.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        currentBalance: totalOutstanding.toFixed(2),
        totalOutstanding: totalOutstanding.toFixed(2),
        purchaseCount: formattedPurchases.length,
        unpaidCount: formattedPurchases.filter((p) => p.paymentStatus !== 'PAID').length,
      },
    });
  } catch (error) {
    console.error('Error fetching supplier ledger:', error);
    res.status(500).json({ error: 'Failed to fetch supplier ledger', details: error.message });
  }
});

export default router;
