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
      paymentStatus = 'UNPAID',
      paymentMethod = null,
      taxType: requestedTaxType,
      items, // array of { productId, qty, rate? }
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invoice must contain at least one product item' });
    }

    let parsedInvoiceDate = new Date();
    if (invoiceDate) {
      const d = new Date(invoiceDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid invoice date' });
      }
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      if (d > endOfToday) {
        return res.status(400).json({ error: 'Invoice date cannot be in the future' });
      }
      parsedInvoiceDate = d;
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
        : await getNextInvoiceNumber(tx, parsedInvoiceDate);

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
          invoiceDate: parsedInvoiceDate,
          customerId: customer.id,
          taxType: finalTaxType,
          taxableTotal: totals.taxableTotal,
          cgstTotal: totals.cgstTotal,
          sgstTotal: totals.sgstTotal,
          igstTotal: totals.igstTotal,
          roundOff: totals.roundOff,
          billAmount: totals.billAmount,
          paidAmount: new Decimal(0),
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
    }, { maxWait: 15000, timeout: 20000 });

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
    }, { maxWait: 15000, timeout: 20000 });

    res.status(201).json(savedReturn);
  } catch (error) {
    console.error('Error creating sales return:', error.message);
    res.status(400).json({ error: error.message || 'Failed to create sales return' });
  }
});

// GET /invoices/:id/edits - get audit logs for invoice
router.get('/:id/edits', async (req, res) => {
  try {
    const edits = await prisma.editLog.findMany({
      where: {
        entityType: 'INVOICE',
        entityId: req.params.id,
      },
      orderBy: { editedAt: 'desc' },
    });
    res.json(edits);
  } catch (error) {
    console.error('Error fetching invoice edit history:', error);
    res.status(500).json({ error: 'Failed to fetch invoice edit history', details: error.message });
  }
});

// PATCH /invoices/:id - Audited edit of invoice with atomic stock delta adjustments
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      reason,
      customerId,
      invoiceDate,
      items, // array of { productId, qty, rate? }
    } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason for editing the invoice is required' });
    }

    const editReason = reason.trim();

    const updatedInvoice = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: {
          customer: true,
          items: {
            include: { product: true },
          },
          returns: { include: { items: true } },
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'CANCELLED') {
        throw new Error('Cannot edit a cancelled invoice');
      }

      // Block edit if invoice has any sales returns against it
      if (invoice.returns && invoice.returns.length > 0) {
        throw new Error('Cannot edit invoice: sales returns have already been processed against this invoice');
      }

      const returnItemsCount = await tx.salesReturnItem.count({
        where: {
          invoiceItemId: { in: invoice.items.map((it) => it.id) },
        },
      });
      if (returnItemsCount > 0) {
        throw new Error('Cannot edit invoice: sales returns have already been processed against this invoice');
      }

      // Payment guard: Block edit if invoice has any active recorded payments
      const activePaymentsCount = await tx.payment.count({
        where: { entityType: 'INVOICE', entityId: invoice.id, status: 'ACTIVE' },
      });
      if (activePaymentsCount > 0 || new Decimal(invoice.paidAmount || 0).gt(0)) {
        throw new Error('Cannot edit invoice: active payments have already been recorded against it. Void active payments first.');
      }

      const editLogs = [];
      const company = await tx.companySettings.findFirst();

      // 1. Check Customer Change
      let targetCustomerId = invoice.customerId;
      let targetCustomer = invoice.customer;
      let finalTaxType = invoice.taxType;

      if (customerId && customerId !== invoice.customerId) {
        const newCustomer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!newCustomer) throw new Error(`Customer not found with id: ${customerId}`);

        editLogs.push({
          entityType: 'INVOICE',
          entityId: invoice.id,
          fieldChanged: 'Customer',
          oldValue: invoice.customer?.name || invoice.customerId,
          newValue: newCustomer.name,
          reason: editReason,
        });

        targetCustomerId = newCustomer.id;
        targetCustomer = newCustomer;

        // Recalculate tax type for new customer
        const customerStateCode = resolveCustomerStateCode(newCustomer) || (newCustomer.state ? newCustomer.state.trim() : null);
        if (customerStateCode) {
          finalTaxType = determineTaxType({
            customerStateCode,
            companyGstin: company?.gstin,
          });
        }
      }

      // 2. Check Invoice Date Change
      let targetInvoiceDate = invoice.invoiceDate;
      if (invoiceDate) {
        const d = new Date(invoiceDate);
        if (isNaN(d.getTime())) {
          throw new Error('Invalid invoice date');
        }
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        if (d > endOfToday) {
          throw new Error('Invoice date cannot be in the future');
        }

        const oldDateStr = new Date(invoice.invoiceDate).toISOString().split('T')[0];
        const newDateStr = d.toISOString().split('T')[0];
        if (oldDateStr !== newDateStr) {
          editLogs.push({
            entityType: 'INVOICE',
            entityId: invoice.id,
            fieldChanged: 'Invoice Date',
            oldValue: oldDateStr,
            newValue: newDateStr,
            reason: editReason,
          });
          targetInvoiceDate = d;
        }
      }

      // 3. Process Line Items
      let finalTotals = {
        taxableTotal: invoice.taxableTotal,
        cgstTotal: invoice.cgstTotal,
        sgstTotal: invoice.sgstTotal,
        igstTotal: invoice.igstTotal,
        roundOff: invoice.roundOff,
        billAmount: invoice.billAmount,
      };

      if (items && Array.isArray(items) && items.length > 0) {
        // Map old quantities per productId
        const oldQtyMap = new Map();
        const oldItemMap = new Map();
        for (const oldIt of invoice.items) {
          const prev = oldQtyMap.get(oldIt.productId) || new Decimal(0);
          oldQtyMap.set(oldIt.productId, prev.plus(new Decimal(oldIt.qty)));
          oldItemMap.set(oldIt.productId, oldIt);
        }

        const newQtyMap = new Map();
        const lineCalculations = [];
        const preparedItems = [];

        for (const it of items) {
          if (!it.productId) throw new Error('Each item must have a productId');
          const qty = new Decimal(it.qty || 0);
          if (qty.lte(0)) throw new Error('Quantity must be greater than zero');

          const product = await tx.product.findUnique({ where: { id: it.productId } });
          if (!product) throw new Error(`Product not found with id: ${it.productId}`);

          const rate = it.rate !== undefined && it.rate !== null
            ? new Decimal(it.rate)
            : new Decimal(product.sellingPrice);

          const calc = calculateLineItem({
            qty,
            rate,
            gstRate: product.gstRate,
            taxType: finalTaxType,
          });

          lineCalculations.push(calc);

          preparedItems.push({
            invoiceId: invoice.id,
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

          const currentNewQty = newQtyMap.get(product.id) || new Decimal(0);
          newQtyMap.set(product.id, currentNewQty.plus(qty));

          // Log detailed item diffs
          const oldIt = oldItemMap.get(product.id);
          if (oldIt) {
            if (!new Decimal(oldIt.qty).equals(calc.qty)) {
              editLogs.push({
                entityType: 'INVOICE',
                entityId: invoice.id,
                fieldChanged: `Item: "${product.name}" - Quantity`,
                oldValue: `${new Decimal(oldIt.qty).toString()} ${product.unit || 'PCS'}`,
                newValue: `${calc.qty.toString()} ${product.unit || 'PCS'}`,
                reason: editReason,
              });
            }
            if (!new Decimal(oldIt.rate).equals(calc.rate)) {
              editLogs.push({
                entityType: 'INVOICE',
                entityId: invoice.id,
                fieldChanged: `Item: "${product.name}" - Rate`,
                oldValue: `₹${new Decimal(oldIt.rate).toFixed(2)}`,
                newValue: `₹${calc.rate.toFixed(2)}`,
                reason: editReason,
              });
            }
          } else {
            editLogs.push({
              entityType: 'INVOICE',
              entityId: invoice.id,
              fieldChanged: `Item: "${product.name}" - Added`,
              oldValue: null,
              newValue: `${calc.qty.toString()} units @ ₹${calc.rate.toFixed(2)}`,
              reason: editReason,
            });
          }
        }

        // Check for removed items
        for (const oldIt of invoice.items) {
          if (!newQtyMap.has(oldIt.productId)) {
            editLogs.push({
              entityType: 'INVOICE',
              entityId: invoice.id,
              fieldChanged: `Item: "${oldIt.descriptionSnapshot || oldIt.product?.name || oldIt.productId}" - Removed`,
              oldValue: `${new Decimal(oldIt.qty).toString()} units`,
              newValue: null,
              reason: editReason,
            });
          }
        }

        // Apply delta stock changes per product
        const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
        for (const prodId of allProductIds) {
          const oldQty = oldQtyMap.get(prodId) || new Decimal(0);
          const newQty = newQtyMap.get(prodId) || new Decimal(0);
          const delta = newQty.minus(oldQty); // positive = more sold (reduce stock), negative = fewer sold (restore stock)

          if (delta.gt(0)) {
            // More items sold -> Atomically decrement product.currentStock using updateMany guard
            const stockUpdated = await tx.product.updateMany({
              where: {
                id: prodId,
                currentStock: { gte: delta },
              },
              data: {
                currentStock: { decrement: delta },
              },
            });

            if (stockUpdated.count === 0) {
              const fresh = await tx.product.findUnique({
                where: { id: prodId },
                select: { name: true, currentStock: true },
              });
              const prodName = fresh?.name || prodId;
              const available = fresh?.currentStock?.toString() || '0';
              throw new Error(
                `Insufficient stock for product "${prodName}". Available: ${available}, Additional required: ${delta.toString()}`
              );
            }

            await tx.stockTransaction.create({
              data: {
                productId: prodId,
                type: 'SALE',
                quantity: delta.negated(), // negative for stock out
                reference: `Invoice edit: ${invoice.invoiceNumber}`,
              },
            });
          } else if (delta.lt(0)) {
            // Fewer items sold -> Restore |delta| to product.currentStock
            const restoreQty = delta.abs();
            await tx.product.update({
              where: { id: prodId },
              data: {
                currentStock: { increment: restoreQty },
              },
            });

            await tx.stockTransaction.create({
              data: {
                productId: prodId,
                type: 'ADJUSTMENT',
                quantity: restoreQty, // positive for stock returned
                reference: `Invoice edit: ${invoice.invoiceNumber}`,
              },
            });
          }
        }

        // Recalculate invoice totals with Prisma.Decimal end-to-end
        finalTotals = calculateInvoiceTotals(lineCalculations, finalTaxType);

        // Replace invoice items
        await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
        await tx.invoiceItem.createMany({ data: preparedItems });

        if (!new Decimal(invoice.billAmount).equals(finalTotals.billAmount)) {
          editLogs.push({
            entityType: 'INVOICE',
            entityId: invoice.id,
            fieldChanged: 'Bill Amount',
            oldValue: `₹${new Decimal(invoice.billAmount).toFixed(2)}`,
            newValue: `₹${new Decimal(finalTotals.billAmount).toFixed(2)}`,
            reason: editReason,
          });
        }
      }

      // Write edit logs to DB
      if (editLogs.length > 0) {
        await tx.editLog.createMany({ data: editLogs });
      }

      // Update Invoice record
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          customerId: targetCustomerId,
          taxType: finalTaxType,
          invoiceDate: targetInvoiceDate,
          taxableTotal: finalTotals.taxableTotal,
          cgstTotal: finalTotals.cgstTotal,
          sgstTotal: finalTotals.sgstTotal,
          igstTotal: finalTotals.igstTotal,
          roundOff: finalTotals.roundOff,
          billAmount: finalTotals.billAmount,
        },
        include: {
          customer: true,
          items: {
            include: { product: true },
          },
        },
      });

      return updated;
    }, { maxWait: 15000, timeout: 20000 });

    res.json(updatedInvoice);
  } catch (error) {
    console.error('Error editing invoice:', error.message);
    res.status(400).json({ error: error.message || 'Failed to edit invoice' });
  }
});

// POST /invoices/:id/cancel - Cancel mistaken invoice (atomic stock restoration)
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const cancelledInvoice = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: {
          items: true,
          returns: { include: { items: true } },
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'CANCELLED') {
        throw new Error('Invoice is already cancelled');
      }

      // Block cancellation if invoice has any sales returns against it
      if (invoice.returns && invoice.returns.length > 0) {
        throw new Error('Cannot cancel invoice: sales returns have already been processed against this invoice');
      }

      const returnItemsCount = await tx.salesReturnItem.count({
        where: {
          invoiceItemId: { in: invoice.items.map((it) => it.id) },
        },
      });
      if (returnItemsCount > 0) {
        throw new Error('Cannot cancel invoice: sales returns have already been processed against this invoice');
      }

      // Block cancellation if active payments exist
      const activePaymentsCount = await tx.payment.count({
        where: { entityType: 'INVOICE', entityId: invoice.id, status: 'ACTIVE' },
      });
      if (activePaymentsCount > 0 || new Decimal(invoice.paidAmount || 0).gt(0)) {
        throw new Error('Cannot cancel invoice: active payments have already been recorded against this invoice. Void active payments first.');
      }

      // Restore stock per item and write a StockTransaction of type CANCELLATION.
      for (const item of invoice.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: {
              increment: item.qty,
            },
          },
        });

        await tx.stockTransaction.create({
          data: {
            productId: item.productId,
            type: 'CANCELLATION',
            quantity: item.qty, // positive = stock restored
            reference: invoice.invoiceNumber,
          },
        });
      }

      // Mark invoice as CANCELLED with reason and timestamp
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason.trim(),
          cancelledAt: new Date(),
        },
        include: {
          customer: true,
          items: true,
        },
      });

      // Record edit log for cancellation
      await tx.editLog.create({
        data: {
          entityType: 'INVOICE',
          entityId: invoice.id,
          fieldChanged: 'Status',
          oldValue: 'ACTIVE',
          newValue: 'CANCELLED',
          reason: reason.trim(),
        },
      });

      return updated;
    }, { maxWait: 15000, timeout: 20000 });

    res.json(cancelledInvoice);
  } catch (error) {
    console.error('Error cancelling invoice:', error.message);
    res.status(400).json({ error: error.message || 'Failed to cancel invoice' });
  }
});

// POST /invoices/:id/payments - Record payment against invoice (atomically with FOR UPDATE row lock)
router.post('/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentDate, paymentMethod = 'CASH', notes } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    }

    const payAmount = new Decimal(amount);

    let parsedPaymentDate = new Date();
    if (paymentDate) {
      const d = new Date(paymentDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid payment date' });
      }
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      if (d > endOfToday) {
        return res.status(400).json({ error: 'Payment date cannot be in the future' });
      }
      parsedPaymentDate = d;
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Acquire row-level lock on Invoice to prevent concurrent overpayments
      await tx.$queryRaw`
        SELECT id FROM "Invoice"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const invoice = await tx.invoice.findUnique({
        where: { id },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'CANCELLED') {
        throw new Error('Cannot record payment against a cancelled invoice');
      }

      const currentPaid = new Decimal(invoice.paidAmount || 0);
      const totalBill = new Decimal(invoice.billAmount);
      const newPaid = currentPaid.plus(payAmount);

      if (newPaid.greaterThan(totalBill)) {
        const remaining = totalBill.minus(currentPaid);
        throw new Error(
          `Payment of ₹${payAmount.toFixed(2)} exceeds remaining balance of ₹${remaining.toFixed(2)} (Bill: ₹${totalBill.toFixed(2)}, Already paid: ₹${currentPaid.toFixed(2)})`
        );
      }

      const newStatus = newPaid.greaterThanOrEqualTo(totalBill)
        ? 'PAID'
        : (newPaid.greaterThan(0) ? 'PARTIAL' : 'UNPAID');

      const payment = await tx.payment.create({
        data: {
          entityType: 'INVOICE',
          entityId: invoice.id,
          amount: payAmount,
          paymentDate: parsedPaymentDate,
          paymentMethod: paymentMethod || 'CASH',
          notes: notes ? notes.trim() : null,
          status: 'ACTIVE',
        },
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          paymentStatus: newStatus,
          paymentMethod: invoice.paymentMethod || paymentMethod || 'CASH',
        },
      });

      return { payment, invoice: updatedInvoice };
    }, { maxWait: 15000, timeout: 20000 });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error recording invoice payment:', error.message);
    res.status(400).json({ error: error.message || 'Failed to record payment' });
  }
});

// GET /invoices/:id/payments - List payments for invoice
router.get('/:id/payments', async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        entityType: 'INVOICE',
        entityId: req.params.id,
      },
      orderBy: { paymentDate: 'desc' },
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching invoice payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments', details: error.message });
  }
});

export default router;

