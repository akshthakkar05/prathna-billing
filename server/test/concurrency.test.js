import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import prisma from '../src/db.js';
import { calculateLineItem, calculateInvoiceTotals } from '../src/utils/billingMath.js';

const Decimal = Prisma.Decimal;

// Helper to execute an invoice creation transaction mirroring routes/invoices.js
async function createInvoiceTx({ customerId, productId, requestedQty, invoiceNumber }) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error('Product not found');

    const qty = new Decimal(requestedQty);
    const rate = new Decimal(product.sellingPrice);
    const calc = calculateLineItem({ qty, rate, gstRate: product.gstRate });
    const totals = calculateInvoiceTotals([calc]);

    // Atomic conditional decrement
    const stockUpdated = await tx.product.updateMany({
      where: {
        id: product.id,
        currentStock: { gte: qty },
      },
      data: {
        currentStock: { decrement: qty },
      },
    });

    if (stockUpdated.count === 0) {
      const fresh = await tx.product.findUnique({ where: { id: product.id }, select: { currentStock: true } });
      throw new Error(`Insufficient stock. Available: ${fresh?.currentStock?.toString() ?? '0'}, Requested: ${qty.toString()}`);
    }

    await tx.stockTransaction.create({
      data: {
        productId: product.id,
        type: 'SALE',
        quantity: qty.negated(),
        reference: invoiceNumber,
      },
    });

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceDate: new Date(),
        customerId,
        taxableTotal: totals.taxableTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        roundOff: totals.roundOff,
        billAmount: totals.billAmount,
        paymentStatus: 'UNPAID',
        items: {
          create: [{
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
          }],
        },
      },
      include: { items: true },
    });

    return invoice;
  });
}

// Helper to execute a purchase transaction mirroring routes/purchases.js
async function createPurchaseTx({ supplierId, productId, purchaseQty, referenceNumber }) {
  return prisma.$transaction(async (tx) => {
    const qty = new Decimal(purchaseQty);
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error('Product not found');

    const rate = new Decimal(product.purchasePrice);
    const gstRate = new Decimal(product.gstRate);
    const taxable = qty.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const gstAmount = taxable.mul(gstRate).div(new Decimal(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const lineAmount = taxable.plus(gstAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    await tx.product.update({
      where: { id: product.id },
      data: { currentStock: { increment: qty } },
    });

    await tx.stockTransaction.create({
      data: {
        productId: product.id,
        type: 'PURCHASE',
        quantity: qty,
        reference: referenceNumber,
      },
    });

    const purchase = await tx.purchase.create({
      data: {
        supplierId,
        referenceNumber,
        purchaseDate: new Date(),
        totalAmount: lineAmount,
        items: {
          create: [{
            productId: product.id,
            qty,
            rate,
            gstRate,
            amount: lineAmount,
          }],
        },
      },
      include: { items: true },
    });

    return purchase;
  });
}

// Helper to execute a sales return transaction mirroring routes/invoices.js (with FOR UPDATE row lock)
async function createSalesReturnTx({ invoiceId, invoiceItemId, returnQty, reason }) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });
    if (!invoice) throw new Error('Invoice not found');

    const invoiceItem = invoice.items.find((i) => i.id === invoiceItemId);
    if (!invoiceItem) throw new Error('Invoice item not found');

    const requestedQty = new Decimal(returnQty);

    // Row-level lock on InvoiceItem
    await tx.$queryRaw`
      SELECT id FROM "InvoiceItem"
      WHERE id = ${invoiceItem.id}
      FOR UPDATE
    `;

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
        `Over-return prevented. Originally sold: ${originallySoldQty.toString()}, already returned: ${alreadyReturnedQty.toString()}, requested: ${requestedQty.toString()}`
      );
    }

    const unitAmount = new Decimal(invoiceItem.amount).div(originallySoldQty);
    const lineReturnAmount = requestedQty.mul(unitAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const salesReturn = await tx.salesReturn.create({
      data: {
        invoiceId: invoice.id,
        returnDate: new Date(),
        reason,
        totalAmount: lineReturnAmount,
        items: {
          create: [{
            invoiceItemId: invoiceItem.id,
            qty: requestedQty,
            amount: lineReturnAmount,
          }],
        },
      },
      include: { items: true },
    });

    await tx.product.update({
      where: { id: invoiceItem.productId },
      data: { currentStock: { increment: requestedQty } },
    });

    await tx.stockTransaction.create({
      data: {
        productId: invoiceItem.productId,
        type: 'SALES_RETURN',
        quantity: requestedQty,
        reference: salesReturn.id,
      },
    });

    return salesReturn;
  });
}

test('Concurrency 1: Two simultaneous invoices competing for stock (opening=5, both ask for 4) -> exactly 1 succeeds, stock=1, no negative stock', async () => {
  const uid = Date.now().toString().slice(-6);

  const customer = await prisma.customer.create({
    data: { name: `Concurrent Customer ${uid}`, mobile: '9998887771' },
  });

  const product = await prisma.product.create({
    data: {
      name: `Race Item ${uid}`,
      hsnCode: '8536',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('100.00'),
      sellingPrice: new Decimal('150.00'),
      currentStock: new Decimal('5.00'), // Only 5 in stock!
      minStockLevel: new Decimal('1.00'),
      unit: 'PCS',
    },
  });

  // Fire both transactions concurrently!
  const results = await Promise.allSettled([
    createInvoiceTx({
      customerId: customer.id,
      productId: product.id,
      requestedQty: '4.00',
      invoiceNumber: `RACE-INV-1-${uid}`,
    }),
    createInvoiceTx({
      customerId: customer.id,
      productId: product.id,
      requestedQty: '4.00',
      invoiceNumber: `RACE-INV-2-${uid}`,
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactly one concurrent invoice must succeed');
  assert.equal(rejected.length, 1, 'Exactly one concurrent invoice must fail');
  assert.match(rejected[0].reason.message, /Insufficient stock/i);

  // Verify stock in database is exactly 1 (5 - 4), never -3 or negative
  const freshProduct = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(freshProduct.currentStock.toString(), '1', 'Current stock must be exactly 1.00');
});

test('Concurrency 2: Two simultaneous purchases increasing stock (both add 10 to initial 10) -> both succeed, stock=30, no lost updates', async () => {
  const uid = Date.now().toString().slice(-6);

  const supplier = await prisma.supplier.create({
    data: { name: `Concurrent Supplier ${uid}`, mobile: '9998887772' },
  });

  const product = await prisma.product.create({
    data: {
      name: `Purchase Race Item ${uid}`,
      hsnCode: '8536',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('100.00'),
      sellingPrice: new Decimal('150.00'),
      currentStock: new Decimal('10.00'),
      unit: 'PCS',
    },
  });

  // Fire two concurrent purchase increments
  const results = await Promise.allSettled([
    createPurchaseTx({
      supplierId: supplier.id,
      productId: product.id,
      purchaseQty: '10.00',
      referenceNumber: `PO-RACE-1-${uid}`,
    }),
    createPurchaseTx({
      supplierId: supplier.id,
      productId: product.id,
      purchaseQty: '10.00',
      referenceNumber: `PO-RACE-2-${uid}`,
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 2, 'Both concurrent purchases must succeed');
  assert.equal(rejected.length, 0, 'Neither purchase should fail');

  const freshProduct = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(freshProduct.currentStock.toString(), '30', 'Stock must be 10 + 10 + 10 = 30 (no lost update)');
});

test('Concurrency 3: Two simultaneous sales returns on same invoice item (sold=3, both return 2) -> row lock prevents over-return, exactly 1 succeeds', async () => {
  const uid = Date.now().toString().slice(-6);

  const customer = await prisma.customer.create({
    data: { name: `Return Race Customer ${uid}`, mobile: '9998887773' },
  });

  const product = await prisma.product.create({
    data: {
      name: `Return Race Item ${uid}`,
      hsnCode: '8536',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('100.00'),
      sellingPrice: new Decimal('150.00'),
      currentStock: new Decimal('10.00'),
      unit: 'PCS',
    },
  });

  // Create an invoice where customer bought 3 units
  const invoice = await createInvoiceTx({
    customerId: customer.id,
    productId: product.id,
    requestedQty: '3.00',
    invoiceNumber: `INV-FOR-RET-${uid}`,
  });

  const invoiceItem = invoice.items[0];
  assert.equal(invoiceItem.qty.toString(), '3');

  // Two simultaneous returns: both attempt to return 2 units out of 3 sold
  const results = await Promise.allSettled([
    createSalesReturnTx({
      invoiceId: invoice.id,
      invoiceItemId: invoiceItem.id,
      returnQty: '2.00',
      reason: 'Concurrent Return A',
    }),
    createSalesReturnTx({
      invoiceId: invoice.id,
      invoiceItemId: invoiceItem.id,
      returnQty: '2.00',
      reason: 'Concurrent Return B',
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactly one return request must succeed');
  assert.equal(rejected.length, 1, 'Second return request must fail due to over-return prevention');
  assert.match(rejected[0].reason.message, /Over-return prevented/i);

  // Total returned quantity in DB must be exactly 2, never 4
  const returnItems = await prisma.salesReturnItem.findMany({
    where: { invoiceItemId: invoiceItem.id },
  });
  const totalReturned = returnItems.reduce((acc, r) => acc.plus(new Decimal(r.qty)), new Decimal(0));
  assert.equal(totalReturned.toString(), '2', 'Total returned quantity in database must be 2, not 4');
});
