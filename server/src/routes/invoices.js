import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { calculateLineItem, calculateInvoiceTotals } from '../utils/billingMath.js';
import { getNextInvoiceNumber } from '../utils/invoiceNumber.js';
import { generateInvoicePDF } from '../utils/pdfGenerator.js';
import { resolveCustomerStateCode, determineTaxType } from '../utils/gstStates.js';

const router = Router();
const Decimal = Prisma.Decimal;

// GET /invoices - list invoices with search & filter support
router.get('/', async (req, res) => {
  try {
    const { search, limit } = req.query;
    const where = {};

    if (search && search.trim()) {
      const q = search.trim();
      const numMatch = q.replace(/^(inv[/-]?(\d{4}[/-]|\d{2}-\d{2}[/-])?)/i, '').trim();

      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { mobile: { contains: q } } },
        { customer: { gstin: { contains: q, mode: 'insensitive' } } },
      ];

      if (numMatch && numMatch !== q) {
        where.OR.push({ invoiceNumber: { contains: numMatch, mode: 'insensitive' } });
      }

      // If valid UUID format, allow direct ID match
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
        where.OR.push({ id: q });
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit, 10) : 100,
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
        returns: {
          include: {
            items: true,
          },
        },
      },
    });
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices', details: error.message });
  }
});

// GET /invoices/:id - fetch single invoice with flexible number / id lookup
router.get('/:id', async (req, res) => {
  try {
    const queryParam = req.params.id.trim();
    const orConditions = [
      { id: queryParam },
      { invoiceNumber: { equals: queryParam, mode: 'insensitive' } },
    ];

    // If user passed a number like "1" or "1001", try matching "INV-1" or "INV-1001"
    if (!queryParam.toUpperCase().startsWith('INV-')) {
      orConditions.push({ invoiceNumber: { equals: `INV-${queryParam}`, mode: 'insensitive' } });
    }

    let invoice = await prisma.invoice.findFirst({
      where: {
        OR: orConditions,
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
        returns: {
          include: {
            items: true,
          },
        },
      },
    });

    // Fallback: If not found by exact, try partial match (contains)
    if (!invoice) {
      invoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            { invoiceNumber: { contains: queryParam, mode: 'insensitive' } },
            { customer: { name: { contains: queryParam, mode: 'insensitive' } } },
            { customer: { mobile: { contains: queryParam } } },
          ],
        },
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
          returns: {
            include: {
              items: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice', details: error.message });
  }
});

// GET /invoices/:id/pdf - Return generated standard A4 PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    let company = await prisma.companySettings.findFirst();
    const copy = req.query.copy || 'Original';

    const pdfBuffer = await generateInvoicePDF(invoice, company, { copy });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ error: 'Failed to generate invoice PDF', details: error.message });
  }
});

// POST /invoices - Create Invoice
router.post('/', async (req, res) => {
  try {
    const {
      customerId,
      invoiceNumber: customInvoiceNumber,
      invoiceDate,
      paymentStatus = 'PAID',
      paymentMethod = 'CASH',
      taxType: requestedTaxType,
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

      const company = await tx.companySettings.findFirst();

      // Resolve state code and tax type using strict precedence
      const customerStateCode = resolveCustomerStateCode(customer) || (customer.state ? customer.state.trim() : null);

      let finalTaxType = requestedTaxType === 'INTERSTATE' || requestedTaxType === 'INTRASTATE'
        ? requestedTaxType
        : null;

      if (!finalTaxType) {
        if (!customerStateCode) {
          throw new Error('Customer state or GSTIN is required to determine tax type (Intra-state vs Inter-state)');
        }
        finalTaxType = determineTaxType({
          customerStateCode,
          companyGstin: company?.gstin,
        });
      }

      // 2. Determine invoiceNumber atomically
      const finalInvoiceNumber = customInvoiceNumber
        ? customInvoiceNumber.trim()
        : await getNextInvoiceNumber(tx, invoiceDate ? new Date(invoiceDate) : new Date());

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

        // Fetch live product to get pricing info (not for stock check — that's done atomically below)
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error(`Product not found with id: ${item.productId}`);
        }

        // Determine rate (excl. GST)
        const rate = item.rate !== undefined && item.rate !== null ? new Decimal(item.rate) : new Decimal(product.sellingPrice);

        // Calculate line item with Prisma.Decimal end-to-end according to taxType
        const calc = calculateLineItem({
          qty: requestedQty,
          rate,
          gstRate: product.gstRate,
          taxType: finalTaxType,
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
          igstAmount: calc.igstAmount,
          amount: calc.amount,
        });

        // Atomically decrement stock at DB level — only succeeds if currentStock >= requestedQty.
        // Using updateMany with a WHERE guard is the safe concurrent approach: no read-check-write
        // race window exists because the DB evaluates the condition and write in one operation.
        const stockUpdated = await tx.product.updateMany({
          where: {
            id: product.id,
            currentStock: { gte: requestedQty },
          },
          data: {
            currentStock: { decrement: requestedQty },
          },
        });

        if (stockUpdated.count === 0) {
          // Re-read current stock just to give a helpful error message (the atomic check already failed)
          const fresh = await tx.product.findUnique({ where: { id: product.id }, select: { currentStock: true, name: true } });
          throw new Error(
            `Insufficient stock for product "${fresh?.name ?? product.name}". Available: ${fresh?.currentStock?.toString() ?? '0'}, Requested: ${requestedQty.toString()}`
          );
        }

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
      const totals = calculateInvoiceTotals(lineCalculations, finalTaxType);

      // 5. Write invoice + invoice_items
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: finalInvoiceNumber,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          customerId: customer.id,
          taxType: finalTaxType,
          taxableTotal: totals.taxableTotal,
          cgstTotal: totals.cgstTotal,
          sgstTotal: totals.sgstTotal,
          igstTotal: totals.igstTotal,
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

// GET /invoices/:id/returns - list returns against an invoice
router.get('/:id/returns', async (req, res) => {
  try {
    const returns = await prisma.salesReturn.findMany({
      where: { invoiceId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            invoiceItem: {
              include: { product: true },
            },
          },
        },
      },
    });
    res.json(returns);
  } catch (error) {
    console.error('Error fetching invoice returns:', error);
    res.status(500).json({ error: 'Failed to fetch invoice returns', details: error.message });
  }
});

// POST /invoices/:id/returns - Create sales return and restock atomically
router.post('/:id/returns', async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const { returnDate, reason, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sales return must contain at least one item' });
    }

    const savedReturn = await prisma.$transaction(async (tx) => {
      // 1. Verify invoice exists
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: true,
        },
      });

      if (!invoice) {
        throw new Error(`Invoice not found with id: ${invoiceId}`);
      }

      let totalReturnAmount = new Decimal(0);
      const preparedReturnItems = [];

      for (const item of items) {
        if (!item.invoiceItemId) {
          throw new Error('Each item must specify an invoiceItemId');
        }

        const requestedQty = new Decimal(item.qty || 0);
        if (requestedQty.lte(0)) {
          throw new Error('Return quantity must be greater than zero');
        }

        // Verify invoiceItem belongs to this invoice
        const invoiceItem = invoice.items.find((i) => i.id === item.invoiceItemId);
        if (!invoiceItem) {
          throw new Error(
            `Invoice item ${item.invoiceItemId} does not belong to invoice ${invoice.invoiceNumber}`
          );
        }

        // Acquire a row-level lock on the InvoiceItem before summing previous returns.
        // This prevents the aggregate race condition: without the lock, two concurrent
        // return requests both read sum=0, both pass the check, and both write — allowing
        // over-return. The FOR UPDATE lock serialises this check-and-write window.
        await tx.$queryRaw`
          SELECT id FROM "InvoiceItem"
          WHERE id = ${invoiceItem.id}
          FOR UPDATE
        `;

        // Now safely read previous returns for this item — no concurrent write can race past the lock
        const previousReturns = await tx.salesReturnItem.findMany({
          where: { invoiceItemId: invoiceItem.id },
        });

        const alreadyReturnedQty = previousReturns.reduce(
          (sum, r) => sum.plus(new Decimal(r.qty)),
          new Decimal(0)
        );

        const originallySoldQty = new Decimal(invoiceItem.qty);
        const maxReturnableQty = originallySoldQty.minus(alreadyReturnedQty);

        if (requestedQty.greaterThan(maxReturnableQty)) {
          throw new Error(
            `Cannot return ${requestedQty.toString()} units of "${invoiceItem.descriptionSnapshot}". Originally sold: ${originallySoldQty.toString()}, already returned: ${alreadyReturnedQty.toString()}, max returnable: ${maxReturnableQty.toString()}`
          );
        }

        // Calculate proportional line amount based on snapshot amount per unit
        const unitAmount = new Decimal(invoiceItem.amount).div(originallySoldQty);
        const lineReturnAmount = requestedQty.mul(unitAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        totalReturnAmount = totalReturnAmount.plus(lineReturnAmount);

        preparedReturnItems.push({
          invoiceItemId: invoiceItem.id,
          productId: invoiceItem.productId,
          qty: requestedQty,
          amount: lineReturnAmount,
        });
      }

      // 2. Create SalesReturn record
      const salesReturn = await tx.salesReturn.create({
        data: {
          invoiceId: invoice.id,
          returnDate: returnDate ? new Date(returnDate) : new Date(),
          reason: reason ? reason.trim() : null,
          totalAmount: totalReturnAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
          items: {
            create: preparedReturnItems.map((pi) => ({
              invoiceItemId: pi.invoiceItemId,
              qty: pi.qty,
              amount: pi.amount,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // 3. For each returned item: increase product stock & write StockTransaction (SALES_RETURN)
      for (const pi of preparedReturnItems) {
        await tx.product.update({
          where: { id: pi.productId },
          data: {
            currentStock: {
              increment: pi.qty,
            },
          },
        });

        await tx.stockTransaction.create({
          data: {
            productId: pi.productId,
            type: 'SALES_RETURN',
            quantity: pi.qty, // positive = stock in
            reference: salesReturn.id,
          },
        });
      }

      return salesReturn;
    });

    res.status(201).json(savedReturn);
  } catch (error) {
    console.error('Error creating sales return:', error.message);
    res.status(400).json({ error: error.message || 'Failed to create sales return' });
  }
});

export default router;
