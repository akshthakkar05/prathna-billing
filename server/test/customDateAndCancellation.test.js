import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/index.js');
const { default: prisma } = await import('../src/db.js');

const Decimal = Prisma.Decimal;

let server;
let baseUrl;
let token;
const createdEntities = {
  invoiceIds: [],
  purchaseIds: [],
  productIds: [],
  customerIds: [],
  supplierIds: [],
};

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Login
  let res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'prijs24@gmail.com', password: 'Prathna@10' }),
  });
  let data = await res.json();
  if (!data.token) {
    res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@prathna.com', password: 'password123' }),
    });
    data = await res.json();
  }
  token = data.token;
});

test.after(async () => {
  // Clean up created test entities only (never wipe the live database)
  try {
    for (const invId of createdEntities.invoiceIds) {
      await prisma.salesReturnItem.deleteMany({
        where: { invoiceItem: { invoiceId: invId } },
      });
      await prisma.salesReturn.deleteMany({ where: { invoiceId: invId } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: invId } });
      await prisma.invoice.deleteMany({ where: { id: invId } });
    }

    for (const pId of createdEntities.purchaseIds) {
      await prisma.purchaseItem.deleteMany({ where: { purchaseId: pId } });
      await prisma.purchase.deleteMany({ where: { id: pId } });
    }

    for (const prodId of createdEntities.productIds) {
      await prisma.stockTransaction.deleteMany({ where: { productId: prodId } });
      await prisma.product.deleteMany({ where: { id: prodId } });
    }

    for (const cId of createdEntities.customerIds) {
      await prisma.customer.deleteMany({ where: { id: cId } });
    }

    for (const sId of createdEntities.supplierIds) {
      await prisma.supplier.deleteMany({ where: { id: sId } });
    }
  } catch (err) {
    console.error('Error in test cleanup:', err);
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await prisma.$disconnect();
});

test('Custom Dates and Cancellation Feature Suite', async (t) => {
  const unique = Date.now().toString().slice(-6);

  // Setup test customer, supplier, and product
  const customer = await prisma.customer.create({
    data: {
      name: `Test CustomDate Customer ${unique}`,
      mobile: `98000${unique}`,
      address: 'Ahmedabad, Gujarat',
      state: '24',
    },
  });
  createdEntities.customerIds.push(customer.id);

  const supplier = await prisma.supplier.create({
    data: {
      name: `Test Supplier ${unique}`,
      mobile: `97000${unique}`,
      address: 'Surat, Gujarat',
    },
  });
  createdEntities.supplierIds.push(supplier.id);

  const product = await prisma.product.create({
    data: {
      name: `Test LED Bulb ${unique}`,
      hsnCode: '8539',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('100.00'),
      sellingPrice: new Decimal('150.00'),
      currentStock: new Decimal('50.00'),
      minStockLevel: new Decimal('5.00'),
      unit: 'PCS',
      isActive: true,
    },
  });
  createdEntities.productIds.push(product.id);

  await t.test('Part A: Invoice Creation with Custom Past Date succeeds', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    const res = await fetch(`${baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        invoiceDate: pastDateStr,
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        items: [{ productId: product.id, qty: '5' }],
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    createdEntities.invoiceIds.push(data.id);

    assert.ok(data.invoiceNumber);
    const invDateStr = new Date(data.invoiceDate).toISOString().split('T')[0];
    assert.equal(invDateStr, pastDateStr);

    // Verify stock decremented from 50 to 45
    const updatedProd = await prisma.product.findUnique({ where: { id: product.id } });
    assert.equal(updatedProd.currentStock.toString(), '45');
  });

  await t.test('Part A: Invoice Creation with Future Date is rejected with 400', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const res = await fetch(`${baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        invoiceDate: futureDateStr,
        items: [{ productId: product.id, qty: '1' }],
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('future'));
  });

  await t.test('Part A: Purchase Creation with Custom Past Date and Future Date validation', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 4);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    // Future date should be rejected
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const resFuture = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supplierId: supplier.id,
        referenceNumber: `PO-FUT-${unique}`,
        purchaseDate: futureDate.toISOString().split('T')[0],
        items: [{ productId: product.id, qty: 10, rate: 100 }],
      }),
    });
    assert.equal(resFuture.status, 400);

    // Past date should succeed and increase stock (45 + 20 = 65)
    const resPast = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supplierId: supplier.id,
        referenceNumber: `PO-PAST-${unique}`,
        purchaseDate: pastDateStr,
        items: [{ productId: product.id, qty: 20, rate: 100 }],
      }),
    });

    assert.equal(resPast.status, 201);
    const purchaseData = await resPast.json();
    createdEntities.purchaseIds.push(purchaseData.id);

    const purDateStr = new Date(purchaseData.purchaseDate).toISOString().split('T')[0];
    assert.equal(purDateStr, pastDateStr);

    const updatedProd = await prisma.product.findUnique({ where: { id: product.id } });
    assert.equal(updatedProd.currentStock.toString(), '65');
  });

  await t.test('Part B: Invoice Cancellation restores stock and logs CANCELLATION transaction', async () => {
    // 1. Create a fresh invoice with 10 units (stock goes 65 -> 55)
    const resCreate = await fetch(`${baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        items: [{ productId: product.id, qty: '10' }],
      }),
    });
    assert.equal(resCreate.status, 201);
    const invoice = await resCreate.json();
    createdEntities.invoiceIds.push(invoice.id);

    let checkProd = await prisma.product.findUnique({ where: { id: product.id } });
    assert.equal(checkProd.currentStock.toString(), '55');

    // 2. Cancellation without reason returns 400
    const resNoReason = await fetch(`${baseUrl}/invoices/${invoice.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: '' }),
    });
    assert.equal(resNoReason.status, 400);

    // 3. Cancel with valid reason
    const resCancel = await fetch(`${baseUrl}/invoices/${invoice.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Mistaken duplicate bill entry' }),
    });
    assert.equal(resCancel.status, 200);
    const cancelledInv = await resCancel.json();

    assert.equal(cancelledInv.status, 'CANCELLED');
    assert.equal(cancelledInv.cancellationReason, 'Mistaken duplicate bill entry');
    assert.ok(cancelledInv.cancelledAt);

    // Verify stock was restored from 55 back to 65
    checkProd = await prisma.product.findUnique({ where: { id: product.id } });
    assert.equal(checkProd.currentStock.toString(), '65');

    // Verify CANCELLATION StockTransaction exists
    const stockTx = await prisma.stockTransaction.findFirst({
      where: {
        productId: product.id,
        type: 'CANCELLATION',
        reference: invoice.invoiceNumber,
      },
    });
    assert.ok(stockTx, 'Must record CANCELLATION StockTransaction');
    assert.equal(stockTx.quantity.toString(), '10');

    // 4. Double cancellation is rejected
    const resDouble = await fetch(`${baseUrl}/invoices/${invoice.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Try cancel again' }),
    });
    assert.equal(resDouble.status, 400);
  });

  await t.test('Part B: Sales Return blocks Invoice Cancellation', async () => {
    // 1. Create an invoice with 5 units
    const resCreate = await fetch(`${baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        items: [{ productId: product.id, qty: '5' }],
      }),
    });
    assert.equal(resCreate.status, 201);
    const invoice = await resCreate.json();
    createdEntities.invoiceIds.push(invoice.id);

    // 2. Process a sales return of 2 units
    const resReturn = await fetch(`${baseUrl}/invoices/${invoice.id}/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reason: 'Customer returned 2 damaged units',
        items: [{ invoiceItemId: invoice.items[0].id, qty: 2 }],
      }),
    });
    assert.equal(resReturn.status, 201);

    // 3. Attempting to cancel invoice must now be blocked
    const resCancel = await fetch(`${baseUrl}/invoices/${invoice.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Want to cancel entire bill' }),
    });

    assert.equal(resCancel.status, 400);
    const data = await resCancel.json();
    assert.ok(data.error.includes('sales returns have already been processed'));
  });

  await t.test('Part B: Purchase Cancellation with Atomic Stock Guard', async () => {
    // 1. Create a multi-item purchase for 2 products
    const prodB = await prisma.product.create({
      data: {
        name: `Test Cable ${unique}`,
        hsnCode: '8544',
        gstRate: new Decimal('18.00'),
        purchasePrice: new Decimal('50.00'),
        sellingPrice: new Decimal('80.00'),
        currentStock: new Decimal('10.00'),
        minStockLevel: new Decimal('2.00'),
        unit: 'MTR',
        isActive: true,
      },
    });
    createdEntities.productIds.push(prodB.id);

    // Current stocks: product = 62, prodB = 10
    // Record purchase: product +10 (-> 72), prodB +10 (-> 20)
    const resPurchase = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supplierId: supplier.id,
        referenceNumber: `PO-MULTI-${unique}`,
        items: [
          { productId: product.id, qty: 10, rate: 100 },
          { productId: prodB.id, qty: 10, rate: 50 },
        ],
      }),
    });
    assert.equal(resPurchase.status, 201);
    const purchase = await resPurchase.json();
    createdEntities.purchaseIds.push(purchase.id);

    // 2. Sell 15 units of prodB so prodB currentStock becomes 5 (< 10)
    // Create an invoice selling 15 units of prodB
    const resSell = await fetch(`${baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        items: [{ productId: prodB.id, qty: '15' }],
      }),
    });
    assert.equal(resSell.status, 201);
    const sellInv = await resSell.json();
    createdEntities.invoiceIds.push(sellInv.id);

    let checkProdB = await prisma.product.findUnique({ where: { id: prodB.id } });
    assert.equal(checkProdB.currentStock.toString(), '5');

    const checkProdA = await prisma.product.findUnique({ where: { id: product.id } });
    const prodAStockBefore = checkProdA.currentStock.toString();

    // 3. Attempting to cancel purchase must fail atomically because prodB only has 5 units left
    const resCancelFail = await fetch(`${baseUrl}/purchases/${purchase.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Supplier recalled shipment' }),
    });

    assert.equal(resCancelFail.status, 400);
    const failData = await resCancelFail.json();
    assert.ok(failData.error.includes('Insufficient stock'));

    // Verify all-or-nothing rollback: productA stock is completely untouched
    const checkProdAAfter = await prisma.product.findUnique({ where: { id: product.id } });
    assert.equal(checkProdAAfter.currentStock.toString(), prodAStockBefore);

    // 4. Now restock prodB by 10 so prodB currentStock = 15 (>= 10), then purchase cancellation succeeds
    await prisma.product.update({
      where: { id: prodB.id },
      data: { currentStock: { increment: 10 } },
    });

    const resCancelSuccess = await fetch(`${baseUrl}/purchases/${purchase.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Supplier recalled shipment - stock confirmed' }),
    });

    assert.equal(resCancelSuccess.status, 200);
    const cancelledPur = await resCancelSuccess.json();
    assert.equal(cancelledPur.status, 'CANCELLED');
    assert.equal(cancelledPur.cancellationReason, 'Supplier recalled shipment - stock confirmed');

    // Verify stock reversed on both products
    const finalProdA = await prisma.product.findUnique({ where: { id: product.id } });
    const finalProdB = await prisma.product.findUnique({ where: { id: prodB.id } });
    assert.equal(finalProdA.currentStock.toString(), (new Decimal(prodAStockBefore).minus(10)).toString());
    assert.equal(finalProdB.currentStock.toString(), '5'); // 15 - 10 = 5

    // Verify PURCHASE_CANCELLED StockTransaction logged
    const pCancelTx = await prisma.stockTransaction.findFirst({
      where: {
        productId: product.id,
        type: 'PURCHASE_CANCELLED',
      },
    });
    assert.ok(pCancelTx);
    assert.equal(pCancelTx.quantity.toString(), '-10');
  });

  await t.test('Part B: Cancelled records are excluded from reports and dashboard totals', async () => {
    const resSales = await fetch(`${baseUrl}/reports/sales`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resSales.status, 200);
    const salesData = await resSales.json();

    // Invoices list contains both active and cancelled
    const foundCancelled = salesData.invoices.find((i) => i.status === 'CANCELLED');
    assert.ok(foundCancelled, 'Cancelled invoice must be listed in report with CANCELLED status');
    assert.ok(foundCancelled.cancellationReason);

    const resPurchases = await fetch(`${baseUrl}/reports/purchases`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resPurchases.status, 200);
    const purData = await resPurchases.json();
    const foundCancelledPur = purData.purchases.find((p) => p.status === 'CANCELLED');
    assert.ok(foundCancelledPur, 'Cancelled purchase must be listed in report with CANCELLED status');
  });
});
