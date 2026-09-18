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
  paymentIds: [],
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
  // Clean up created test entities only
  try {
    for (const pId of createdEntities.paymentIds) {
      await prisma.payment.deleteMany({ where: { id: pId } });
    }

    for (const invId of createdEntities.invoiceIds) {
      await prisma.editLog.deleteMany({ where: { entityType: 'INVOICE', entityId: invId } });
      await prisma.payment.deleteMany({ where: { entityType: 'INVOICE', entityId: invId } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: invId } });
      await prisma.invoice.deleteMany({ where: { id: invId } });
    }

    for (const pId of createdEntities.purchaseIds) {
      await prisma.editLog.deleteMany({ where: { entityType: 'PURCHASE', entityId: pId } });
      await prisma.payment.deleteMany({ where: { entityType: 'PURCHASE', entityId: pId } });
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

test('Payments and Ledger Test Suite', async (t) => {
  const unique = Date.now().toString().slice(-6);

  // Setup test customer, supplier, and product
  const customer = await prisma.customer.create({
    data: {
      name: `Test Ledger Customer ${unique}`,
      mobile: `98100${unique}`,
      address: 'Ahmedabad, Gujarat',
      state: '24',
    },
  });
  createdEntities.customerIds.push(customer.id);

  const supplier = await prisma.supplier.create({
    data: {
      name: `Test Ledger Supplier ${unique}`,
      mobile: `97100${unique}`,
      address: 'Surat, Gujarat',
    },
  });
  createdEntities.supplierIds.push(supplier.id);

  const product = await prisma.product.create({
    data: {
      name: `Test Ledger Switch ${unique}`,
      hsnCode: '8536',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('100.00'),
      sellingPrice: new Decimal('200.00'),
      currentStock: new Decimal('100.00'),
      minStockLevel: new Decimal('10.00'),
      unit: 'PCS',
      isActive: true,
    },
  });
  createdEntities.productIds.push(product.id);

  let testInvoiceId;
  let testPurchaseId;
  let firstPaymentId;
  let concurrentPaymentId;

  await t.test('1. Invoice Creation defaults to UNPAID and paidAmount 0', async () => {
    const res = await fetch(`${baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        items: [{ productId: product.id, qty: '5' }], // 5 * 200 = 1000 + 18% GST = 1180
      }),
    });

    assert.equal(res.status, 201);
    const inv = await res.json();
    testInvoiceId = inv.id;
    createdEntities.invoiceIds.push(inv.id);

    assert.equal(inv.paymentStatus, 'UNPAID');
    assert.equal(inv.paidAmount, '0');
    assert.equal(inv.billAmount, '1180');
  });

  await t.test('2. Recording a partial payment transitions status to PARTIAL', async () => {
    const res = await fetch(`${baseUrl}/invoices/${testInvoiceId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: 500,
        paymentMethod: 'UPI',
        notes: 'First installment via GPay',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    const pmt = body.payment;
    firstPaymentId = pmt.id;
    createdEntities.paymentIds.push(pmt.id);

    assert.equal(pmt.amount, '500');
    assert.equal(pmt.entityType, 'INVOICE');
    assert.equal(pmt.entityId, testInvoiceId);
    assert.equal(pmt.status, 'ACTIVE');

    // Verify invoice state
    const inv = await prisma.invoice.findUnique({ where: { id: testInvoiceId } });
    assert.equal(inv.paidAmount.toString(), '500');
    assert.equal(inv.paymentStatus, 'PARTIAL');
  });

  await t.test('3. Future payment date is rejected with 400', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);

    const res = await fetch(`${baseUrl}/invoices/${testInvoiceId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: 100,
        paymentDate: tomorrow.toISOString().split('T')[0],
        paymentMethod: 'CASH',
      }),
    });

    assert.equal(res.status, 400);
    const err = await res.json();
    assert.ok(err.error.includes('future'));
  });

  await t.test('4. Overpayment is rejected with 400', async () => {
    // Current billAmount = 1180, paidAmount = 500, remaining = 680
    const res = await fetch(`${baseUrl}/invoices/${testInvoiceId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: 700, // 500 + 700 = 1200 > 1180
        paymentMethod: 'CASH',
      }),
    });

    assert.equal(res.status, 400);
    const err = await res.json();
    assert.ok(err.error.includes('exceeds remaining balance'));
  });

  await t.test('5. Concurrent payments cannot overpay (Row lock FOR UPDATE)', async () => {
    // Current remaining = 680
    // Try two concurrent payments of 400 each (400 + 400 = 800 > 680)
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/invoices/${testInvoiceId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: 400,
          paymentMethod: 'CASH',
          notes: 'Concurrent test p1',
        }),
      }),
      fetch(`${baseUrl}/invoices/${testInvoiceId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: 400,
          paymentMethod: 'CASH',
          notes: 'Concurrent test p2',
        }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [201, 400], 'Exactly one concurrent payment must succeed and one must fail');

    const successRes = res1.status === 201 ? res1 : res2;
    const successBody = await successRes.json();
    concurrentPaymentId = successBody.payment.id;
    createdEntities.paymentIds.push(concurrentPaymentId);

    // Verify invoice paidAmount is now 900 (500 + 400)
    const inv = await prisma.invoice.findUnique({ where: { id: testInvoiceId } });
    assert.equal(inv.paidAmount.toString(), '900');
    assert.equal(inv.paymentStatus, 'PARTIAL');
  });

  await t.test('6. Invoices with active payments block cancellation and editing', async () => {
    // Attempt cancellation
    const resCancel = await fetch(`${baseUrl}/invoices/${testInvoiceId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Attempt cancel with active payments' }),
    });
    assert.equal(resCancel.status, 400);
    const cancelErr = await resCancel.json();
    assert.ok(cancelErr.error.includes('active payments'));

    // Attempt edit
    const resEdit = await fetch(`${baseUrl}/invoices/${testInvoiceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        items: [{ productId: product.id, qty: '10' }],
        reason: 'Attempt edit with active payments',
      }),
    });
    assert.equal(resEdit.status, 400);
    const editErr = await resEdit.json();
    assert.ok(editErr.error.includes('active payments'));
  });

  await t.test('7. Voiding a payment decreases paidAmount, updates status, and logs in EditLog', async () => {
    // Void first payment (amount: 500)
    const resVoid = await fetch(`${baseUrl}/payments/${firstPaymentId}/void`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Payment cheque bounced' }),
    });

    assert.equal(resVoid.status, 200);
    const body = await resVoid.json();
    const voided = body.payment;
    assert.equal(voided.status, 'VOIDED');
    assert.equal(voided.voidReason, 'Payment cheque bounced');

    // Check invoice paidAmount decreased from 900 to 400
    const inv = await prisma.invoice.findUnique({ where: { id: testInvoiceId } });
    assert.equal(inv.paidAmount.toString(), '400');
    assert.equal(inv.paymentStatus, 'PARTIAL');

    // Verify EditLog
    const editLogs = await prisma.editLog.findMany({
      where: { entityType: 'INVOICE', entityId: testInvoiceId },
    });
    assert.ok(editLogs.length >= 1);
    const voidLog = editLogs.find((l) => l.reason && l.reason.includes('Payment cheque bounced'));
    assert.ok(voidLog);
  });

  await t.test('8. Final payment marks invoice as PAID', async () => {
    // Current paidAmount = 400, billAmount = 1180, remaining = 780
    const res = await fetch(`${baseUrl}/invoices/${testInvoiceId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: 780,
        paymentMethod: 'BANK_TRANSFER',
        notes: 'Full settlement via NEFT',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    const pmt = body.payment;
    createdEntities.paymentIds.push(pmt.id);

    const inv = await prisma.invoice.findUnique({ where: { id: testInvoiceId } });
    assert.equal(inv.paidAmount.toString(), '1180');
    assert.equal(inv.paymentStatus, 'PAID');
  });

  await t.test('9. Purchase payments workflow (Create, Pay, Overpay guard, Status update)', async () => {
    // 1. Create Purchase (exclusive of GST so 1000 + 18% = 1180)
    const resPur = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supplierId: supplier.id,
        referenceNumber: `BILL-PAY-${unique}`,
        items: [{ productId: product.id, qty: 10, rate: 100, isInclusive: false }], // 1000 + 18% GST = 1180
      }),
    });

    assert.equal(resPur.status, 201);
    const pur = await resPur.json();
    testPurchaseId = pur.id;
    createdEntities.purchaseIds.push(pur.id);

    assert.equal(pur.paymentStatus, 'UNPAID');
    assert.equal(pur.paidAmount, '0');

    // 2. Record Partial Payment
    const resPmt1 = await fetch(`${baseUrl}/purchases/${testPurchaseId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: 600,
        paymentMethod: 'BANK_TRANSFER',
        notes: 'Advance supplier payment',
      }),
    });
    assert.equal(resPmt1.status, 201);
    const body1 = await resPmt1.json();
    const pmt1 = body1.payment;
    createdEntities.paymentIds.push(pmt1.id);

    const checkPur1 = await prisma.purchase.findUnique({ where: { id: testPurchaseId } });
    assert.equal(checkPur1.paidAmount.toString(), '600');
    assert.equal(checkPur1.paymentStatus, 'PARTIAL');

    // 3. Active payment blocks cancellation
    const resCancel = await fetch(`${baseUrl}/purchases/${testPurchaseId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: 'Attempt cancel purchase with payment' }),
    });
    assert.equal(resCancel.status, 400);

    // 4. Overpayment blocked
    const resOverpay = await fetch(`${baseUrl}/purchases/${testPurchaseId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: 600, // 600 + 600 = 1200 > 1180
        paymentMethod: 'CASH',
      }),
    });
    assert.equal(resOverpay.status, 400);

    // 5. Pay remaining 580 -> PAID
    const resPmt2 = await fetch(`${baseUrl}/purchases/${testPurchaseId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: 580,
        paymentMethod: 'CASH',
        notes: 'Balance cleared',
      }),
    });
    assert.equal(resPmt2.status, 201);
    const body2 = await resPmt2.json();
    const pmt2 = body2.payment;
    createdEntities.paymentIds.push(pmt2.id);

    const checkPur2 = await prisma.purchase.findUnique({ where: { id: testPurchaseId } });
    assert.equal(checkPur2.paidAmount.toString(), '1180');
    assert.equal(checkPur2.paymentStatus, 'PAID');
  });

  await t.test('10. Customer Ledger returns correct transactions and summary balance', async () => {
    const res = await fetch(`${baseUrl}/customers/${customer.id}/ledger`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const ledger = await res.json();

    assert.equal(ledger.customer.id, customer.id);
    assert.ok(Array.isArray(ledger.transactions));
    assert.ok(ledger.summary);

    // Customer summary totals: totalInvoiced, totalPaid, currentBalance
    assert.equal(ledger.summary.totalInvoiced, '1180.00');
    assert.equal(ledger.summary.totalPaid, '1180.00');
    assert.equal(ledger.summary.currentBalance, '0.00');

    // Should contain INVOICE debit, PAYMENT credit, and VOIDED_PAYMENT
    const invoiceTx = ledger.transactions.find((t) => t.type === 'INVOICE');
    assert.ok(invoiceTx);
    assert.equal(invoiceTx.debit, '1180.00');

    const paymentTxs = ledger.transactions.filter((t) => t.type === 'PAYMENT');
    assert.ok(paymentTxs.length >= 2);
  });

  await t.test('11. Supplier Ledger returns correct transactions and summary balance', async () => {
    const res = await fetch(`${baseUrl}/suppliers/${supplier.id}/ledger`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const ledger = await res.json();

    assert.equal(ledger.supplier.id, supplier.id);
    assert.ok(Array.isArray(ledger.transactions));
    assert.ok(ledger.summary);

    assert.equal(ledger.summary.totalPurchased, '1180.00');
    assert.equal(ledger.summary.totalPaid, '1180.00');
    assert.equal(ledger.summary.currentBalance, '0.00');
  });

  await t.test('12. Dashboard Summary includes totalReceivables and totalPayables', async () => {
    // Create an unpaid invoice and an unpaid purchase to check dashboard outstanding calculations
    const resInv = await fetch(`${baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerId: customer.id,
        items: [{ productId: product.id, qty: '2' }], // 2 * 200 = 400 + 18% = 472
      }),
    });
    const unpaidInv = await resInv.json();
    createdEntities.invoiceIds.push(unpaidInv.id);

    const resPur = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supplierId: supplier.id,
        referenceNumber: `DASH-PUR-${unique}`,
        items: [{ productId: product.id, qty: 5, rate: 100, isInclusive: false }], // 500 + 18% = 590
      }),
    });
    const unpaidPur = await resPur.json();
    createdEntities.purchaseIds.push(unpaidPur.id);

    const resDash = await fetch(`${baseUrl}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resDash.status, 200);
    const dash = await resDash.json();

    assert.ok(dash.outstanding);
    assert.ok(new Decimal(dash.outstanding.totalReceivables).greaterThanOrEqualTo(472));
    assert.ok(dash.outstanding.unpaidInvoicesCount >= 1);
    assert.ok(new Decimal(dash.outstanding.totalPayables).greaterThanOrEqualTo(590));
    assert.ok(dash.outstanding.unpaidPurchasesCount >= 1);
  });
});
