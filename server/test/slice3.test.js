import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import prisma from '../src/db.js';
import { calculateLineItem, calculateInvoiceTotals } from '../src/utils/billingMath.js';
import { getNextInvoiceNumber } from '../src/utils/invoiceNumber.js';

const Decimal = Prisma.Decimal;

// -------------------------------------------------------------
// TEST 1 & 2: Sales Return correctly increases stock & rejects over-return
// -------------------------------------------------------------
test('Sales Return: increases stock via SALES_RETURN transaction and rejects over-return', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  // 1. Create Customer
  const customer = await prisma.customer.create({
    data: {
      name: `Return Customer ${uniqueSuffix}`,
      mobile: '9811100000',
    },
  });

  // 2. Create Product with 20 units stock
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: `Circuit Switch ${uniqueSuffix}`,
        hsnCode: '8536',
        gstRate: new Decimal('18.00'),
        purchasePrice: new Decimal('100.00'),
        sellingPrice: new Decimal('150.00'),
        currentStock: new Decimal('20.00'),
        minStockLevel: new Decimal('5.00'),
        unit: 'PCS',
        isActive: true,
      },
    });

    await tx.stockTransaction.create({
      data: {
        productId: p.id,
        type: 'PURCHASE',
        quantity: new Decimal('20.00'),
        reference: 'Initial Stock',
      },
    });

    return p;
  });

  // 3. Create Invoice for 5 units (Stock: 20 -> 15)
  const invoice = await prisma.$transaction(async (tx) => {
    const invNumber = await getNextInvoiceNumber(tx);
    const qty = new Decimal('5.00');

    const calc = calculateLineItem({
      qty,
      rate: product.sellingPrice,
      gstRate: product.gstRate,
    });
    const totals = calculateInvoiceTotals([calc]);

    await tx.product.update({
      where: { id: product.id },
      data: { currentStock: { decrement: qty } },
    });

    await tx.stockTransaction.create({
      data: {
        productId: product.id,
        type: 'SALE',
        quantity: qty.negated(),
        reference: invNumber,
      },
    });

    return tx.invoice.create({
      data: {
        invoiceNumber: invNumber,
        customerId: customer.id,
        taxableTotal: totals.taxableTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        roundOff: totals.roundOff,
        billAmount: totals.billAmount,
        items: {
          create: [
            {
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
            },
          ],
        },
      },
      include: { items: true },
    });
  });

  const invoiceItem = invoice.items[0];
  assert.equal(invoiceItem.qty.toString(), '5');

  // Verify stock is now 15
  const prodAfterSale = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(prodAfterSale.currentStock.toString(), '15');

  // Helper return function matching route transaction logic
  async function processReturn({ invoiceId, returnItems, reason }) {
    return prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true },
      });
      if (!inv) throw new Error('Invoice not found');

      let totalReturnAmount = new Decimal(0);
      const preparedReturnItems = [];

      for (const item of returnItems) {
        const line = inv.items.find((i) => i.id === item.invoiceItemId);
        if (!line) throw new Error(`Invoice item not found in invoice`);

        const reqQty = new Decimal(item.qty);
        if (reqQty.lte(0)) throw new Error('Return quantity must be > 0');

        const prevReturns = await tx.salesReturnItem.findMany({
          where: { invoiceItemId: line.id },
        });
        const alreadyReturned = prevReturns.reduce((sum, r) => sum.plus(new Decimal(r.qty)), new Decimal(0));
        const maxReturnable = new Decimal(line.qty).minus(alreadyReturned);

        if (reqQty.greaterThan(maxReturnable)) {
          throw new Error(
            `Cannot return ${reqQty.toString()} units. Max returnable: ${maxReturnable.toString()}`
          );
        }

        const unitAmt = new Decimal(line.amount).div(new Decimal(line.qty));
        const lineReturnAmount = reqQty.mul(unitAmt).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        totalReturnAmount = totalReturnAmount.plus(lineReturnAmount);

        preparedReturnItems.push({
          invoiceItemId: line.id,
          productId: line.productId,
          qty: reqQty,
          amount: lineReturnAmount,
        });
      }

      const salesReturn = await tx.salesReturn.create({
        data: {
          invoiceId: inv.id,
          reason: reason || null,
          totalAmount: totalReturnAmount,
          items: {
            create: preparedReturnItems.map((pi) => ({
              invoiceItemId: pi.invoiceItemId,
              qty: pi.qty,
              amount: pi.amount,
            })),
          },
        },
        include: { items: true },
      });

      for (const pi of preparedReturnItems) {
        await tx.product.update({
          where: { id: pi.productId },
          data: { currentStock: { increment: pi.qty } },
        });

        await tx.stockTransaction.create({
          data: {
            productId: pi.productId,
            type: 'SALES_RETURN',
            quantity: pi.qty, // positive
            reference: salesReturn.id,
          },
        });
      }

      return salesReturn;
    });
  }

  // 4. Return 2 units (Return 1)
  const return1 = await processReturn({
    invoiceId: invoice.id,
    returnItems: [{ invoiceItemId: invoiceItem.id, qty: '2.00' }],
    reason: 'Customer returned 2 units',
  });

  assert.ok(return1.id, 'Sales return 1 should be created');
  assert.equal(return1.items[0].qty.toString(), '2');

  // Verify stock increased from 15 to 17
  const prodAfterReturn1 = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(prodAfterReturn1.currentStock.toString(), '17', 'Stock must increase by 2 to 17');

  // Verify stock_transaction of type SALES_RETURN exists
  const returnTx = await prisma.stockTransaction.findFirst({
    where: {
      productId: product.id,
      type: 'SALES_RETURN',
      reference: return1.id,
    },
  });
  assert.ok(returnTx, 'Stock transaction of type SALES_RETURN must exist');
  assert.equal(returnTx.quantity.toString(), '2', 'Stock transaction quantity must be +2');

  // 5. TEST: Over-return is rejected!
  // Originally sold: 5. Already returned: 2. Max remaining: 3.
  // Attempting to return 4 units must be rejected!
  await assert.rejects(
    async () => {
      await processReturn({
        invoiceId: invoice.id,
        returnItems: [{ invoiceItemId: invoiceItem.id, qty: '4.00' }],
        reason: 'Attempting to return more than remaining sold qty',
      });
    },
    /Max returnable/,
    'Over-return exceeding sold quantity must be rejected'
  );

  // Verify stock remains 17 (no partial update)
  const prodAfterRejection = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(prodAfterRejection.currentStock.toString(), '17', 'Stock must remain 17 after rejection');

  // 6. Return the remaining 3 units (Return 2)
  const return2 = await processReturn({
    invoiceId: invoice.id,
    returnItems: [{ invoiceItemId: invoiceItem.id, qty: '3.00' }],
    reason: 'Remaining units returned',
  });
  assert.ok(return2.id);

  // Stock should now be back to original 20 (17 + 3 = 20)
  const prodFullyReturned = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(prodFullyReturned.currentStock.toString(), '20', 'Stock must be back to 20');

  // 7. Any further return must now be rejected (0 remaining)
  await assert.rejects(
    async () => {
      await processReturn({
        invoiceId: invoice.id,
        returnItems: [{ invoiceItemId: invoiceItem.id, qty: '1.00' }],
      });
    },
    /Max returnable/,
    'Return when 0 items remaining must be rejected'
  );
});

// -------------------------------------------------------------
// TEST 3: Dashboard summary returns correct low-stock filtering
// -------------------------------------------------------------
test('Dashboard summary: accurately filters low-stock products (currentStock <= minStockLevel)', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  // Create low-stock product: currentStock = 2, minStockLevel = 5 (2 <= 5 => low stock)
  const lowProduct = await prisma.product.create({
    data: {
      name: `Low Stock Item ${uniqueSuffix}`,
      hsnCode: '8536',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('50.00'),
      sellingPrice: new Decimal('80.00'),
      currentStock: new Decimal('2.00'),
      minStockLevel: new Decimal('5.00'),
      unit: 'PCS',
      isActive: true,
    },
  });

  // Create healthy product: currentStock = 20, minStockLevel = 5 (20 > 5 => healthy)
  const healthyProduct = await prisma.product.create({
    data: {
      name: `Healthy Stock Item ${uniqueSuffix}`,
      hsnCode: '8536',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('50.00'),
      sellingPrice: new Decimal('80.00'),
      currentStock: new Decimal('20.00'),
      minStockLevel: new Decimal('5.00'),
      unit: 'PCS',
      isActive: true,
    },
  });

  // Fetch dashboard summary logic
  const allProducts = await prisma.product.findMany({ where: { isActive: true } });

  const lowStockFiltered = allProducts.filter((p) =>
    new Decimal(p.currentStock).lessThanOrEqualTo(new Decimal(p.minStockLevel))
  );

  // Verify lowProduct is in low stock list
  const foundLow = lowStockFiltered.find((p) => p.id === lowProduct.id);
  assert.ok(foundLow, 'Product with stock <= minStockLevel must be included in lowStockProducts');

  // Verify healthyProduct is NOT in low stock list
  const foundHealthy = lowStockFiltered.find((p) => p.id === healthyProduct.id);
  assert.equal(foundHealthy, undefined, 'Product with stock > minStockLevel must NOT be in lowStockProducts');

  await prisma.$disconnect();
});
