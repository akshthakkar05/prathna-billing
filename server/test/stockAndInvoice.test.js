import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import prisma from '../src/db.js';
import { calculateLineItem, calculateInvoiceTotals } from '../src/utils/billingMath.js';

const Decimal = Prisma.Decimal;

test('Stock decrement on invoice creation and rejection on insufficient stock', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  // 1. Create a customer
  const customer = await prisma.customer.create({
    data: {
      name: `Test Customer ${uniqueSuffix}`,
      mobile: '9876500000',
      address: 'Test Address',
    },
  });

  // 2. Create a product with 10 units opening stock
  const initialStock = new Decimal('10.00');
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: `Test Circuit Breaker ${uniqueSuffix}`,
        hsnCode: '8536',
        gstRate: new Decimal('18.00'),
        purchasePrice: new Decimal('200.00'),
        sellingPrice: new Decimal('300.00'),
        currentStock: initialStock,
        minStockLevel: new Decimal('2.00'),
        unit: 'PCS',
        isActive: true,
      },
    });

    await tx.stockTransaction.create({
      data: {
        productId: p.id,
        type: 'PURCHASE',
        quantity: initialStock,
        reference: 'Initial Opening Stock',
      },
    });

    return p;
  });

  assert.equal(product.currentStock.toString(), '10');

  // Helper invoice creation function matching route transaction logic
  async function createInvoiceWithStockDeduction({ customerId, productId, requestedQty, invoiceNumber }) {
    return prisma.$transaction(async (tx) => {
      const liveProduct = await tx.product.findUnique({ where: { id: productId } });
      const currentStock = new Decimal(liveProduct.currentStock);
      const qty = new Decimal(requestedQty);

      if (currentStock.lessThan(qty)) {
        throw new Error(
          `Insufficient stock for product "${liveProduct.name}". Available: ${currentStock.toString()}, Requested: ${qty.toString()}`
        );
      }

      const calc = calculateLineItem({
        qty,
        rate: liveProduct.sellingPrice,
        gstRate: liveProduct.gstRate,
      });

      const totals = calculateInvoiceTotals([calc]);

      // Deduct stock
      await tx.product.update({
        where: { id: productId },
        data: { currentStock: currentStock.minus(qty) },
      });

      // Write stock_transaction of type SALE (negative quantity)
      await tx.stockTransaction.create({
        data: {
          productId,
          type: 'SALE',
          quantity: qty.negated(),
          reference: invoiceNumber,
        },
      });

      // Create invoice + items
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId,
          taxableTotal: totals.taxableTotal,
          cgstTotal: totals.cgstTotal,
          sgstTotal: totals.sgstTotal,
          roundOff: totals.roundOff,
          billAmount: totals.billAmount,
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
          items: {
            create: [
              {
                productId,
                descriptionSnapshot: liveProduct.name,
                hsnSnapshot: liveProduct.hsnCode,
                gstRateSnapshot: calc.gstRateSnapshot,
                qty: calc.qty,
                rate: calc.rate,
                taxableValue: calc.taxableValue,
                cgstAmount: calc.cgstAmount,
                sgstAmount: calc.sgstAmount,
                amount: calc.amount,
              },
            ],
          },
        },
        include: { items: true },
      });

      return invoice;
    });
  }

  // 3. Create Invoice for 4 units
  const inv1 = await createInvoiceWithStockDeduction({
    customerId: customer.id,
    productId: product.id,
    requestedQty: '4.00',
    invoiceNumber: `TEST-INV-${uniqueSuffix}-1`,
  });

  assert.ok(inv1.id, 'Invoice 1 should be created');
  assert.equal(inv1.items[0].qty.toString(), '4');
  assert.equal(inv1.paymentStatus, 'PAID', 'Default paymentStatus must be PAID');
  assert.equal(inv1.paymentMethod, 'CASH', 'Default paymentMethod must be CASH');

  // Verify stock decreased from 10 to 6
  const productAfterSale = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(productAfterSale.currentStock.toString(), '6', 'Stock should have decreased from 10 to 6');

  // Verify stock transaction row of type SALE with quantity -4
  const saleTx = await prisma.stockTransaction.findFirst({
    where: {
      productId: product.id,
      type: 'SALE',
      reference: `TEST-INV-${uniqueSuffix}-1`,
    },
  });
  assert.ok(saleTx, 'Stock transaction of type SALE should exist');
  assert.equal(saleTx.quantity.toString(), '-4', 'Sale transaction quantity must be negative (-4)');

  // 4. Attempt to create Invoice for 7 units (when only 6 units are available)
  await assert.rejects(
    async () => {
      await createInvoiceWithStockDeduction({
        customerId: customer.id,
        productId: product.id,
        requestedQty: '7.00',
        invoiceNumber: `TEST-INV-${uniqueSuffix}-2`,
      });
    },
    /Insufficient stock/,
    'Invoice creation should be rejected with Insufficient stock error'
  );

  // 5. Verify stock was NOT partially deducted and remains at 6
  const productAfterRejection = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(
    productAfterRejection.currentStock.toString(),
    '6',
    'Product stock must remain at 6 after transaction rollback'
  );

  await prisma.$disconnect();
});
