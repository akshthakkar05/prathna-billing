import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { calculateLineItem, calculateInvoiceTotals } from '../utils/billingMath.js';
import { getNextInvoiceNumber } from '../utils/invoiceNumber.js';
import { generateInvoicePDF } from '../utils/pdfGenerator.js';

const router = Router();
const Decimal = Prisma.Decimal;

// GET /invoices - list invoices (useful for minimal UI and tests)
router.get('/', async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        items: true,
      },
    });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoices', details: error.message });
  }
});

// GET /invoices/:id/pdf - Return generated standard A4 PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: true, // Snapshots are preserved on items
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    let company = await prisma.companySettings.findFirst();

    const pdfBuffer = await generateInvoicePDF(invoice, company);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ error: 'Failed to generate invoice PDF', details: error.message });
  }
});

// GET /invoices/:id - Return the saved invoice as JSON
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: true, // Snapshots are preserved on items
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice', details: error.message });
  }
});

// POST /invoices - Create Invoice
router.post('/', async (req, res) => {
  try {
    const {
      customerId,
      invoiceNumber: customInvoiceNumber,
      invoiceDate,
      paymentStatus = 'UNPAID',
      paymentMethod = null,
      items, // array of { productId, qty, rate? }
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invoice must contain at least one product item' });
    }

    // Atomic transaction: invoice + invoice_items + stock_transactions + stock updates
    const savedInvoice = await prisma.$transaction(async (tx) => {
      // 1. Verify customer
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });
      if (!customer) {
        throw new Error(`Customer not found with id: ${customerId}`);
      }

      // 2. Determine invoiceNumber atomically
      const finalInvoiceNumber = customInvoiceNumber
        ? customInvoiceNumber.trim()
        : await getNextInvoiceNumber(tx);

      // 3. Process items, validate stock, and compute line items with Decimal
      const lineCalculations = [];
      const preparedItems = [];

      for (const item of items) {
        if (!item.productId) {
          throw new Error('Each item must specify a productId');
        }

        const requestedQty = new Decimal(item.qty || 0);
        if (requestedQty.lte(0)) {
          throw new Error('Quantity must be greater than zero');
        }

        // Fetch live product to get current stock and pricing
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error(`Product not found with id: ${item.productId}`);
        }

        const currentStock = new Decimal(product.currentStock);

        // Insufficient stock check: REJECT whole invoice if any product has insufficient stock
        if (currentStock.lessThan(requestedQty)) {
          throw new Error(
            `Insufficient stock for product "${product.name}". Available: ${currentStock.toString()}, Requested: ${requestedQty.toString()}`
          );
        }

        // Determine rate (excl. GST)
        const rate = item.rate !== undefined && item.rate !== null ? new Decimal(item.rate) : new Decimal(product.sellingPrice);

        // Calculate line item with Prisma.Decimal end-to-end
        const calc = calculateLineItem({
          qty: requestedQty,
          rate,
          gstRate: product.gstRate,
        });

        lineCalculations.push(calc);

        preparedItems.push({
          productId: product.id,
          descriptionSnapshot: product.name,
          hsnSnapshot: product.hsnCode,
          gstRateSnapshot: calc.gstRateSnapshot,
          qty: calc.qty,
          rate: calc.rate,
          taxableValue: calc.taxableValue,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          amount: calc.amount,
        });

        // Update product stock
        await tx.product.update({
          where: { id: product.id },
          data: {
            currentStock: currentStock.minus(requestedQty),
          },
        });

        // Write a stock_transaction of type SALE (negative quantity) for each item
        await tx.stockTransaction.create({
          data: {
            productId: product.id,
            type: 'SALE',
            quantity: requestedQty.negated(),
            reference: finalInvoiceNumber,
          },
        });
      }

      // 4. Calculate invoice totals using Prisma.Decimal end-to-end
      const totals = calculateInvoiceTotals(lineCalculations);

      // 5. Write invoice + invoice_items
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: finalInvoiceNumber,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          customerId: customer.id,
          taxableTotal: totals.taxableTotal,
          cgstTotal: totals.cgstTotal,
          sgstTotal: totals.sgstTotal,
          roundOff: totals.roundOff,
          billAmount: totals.billAmount,
          paymentStatus,
          paymentMethod,
          items: {
            create: preparedItems,
          },
        },
        include: {
          customer: true,
          items: true,
        },
      });

      return invoice;
    });

    res.status(201).json(savedInvoice);
  } catch (error) {
    console.error('Error creating invoice:', error.message);
    res.status(400).json({ error: error.message || 'Failed to create invoice' });
  }
});

export default router;
