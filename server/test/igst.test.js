import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/db.js';
import {
  INDIAN_STATES,
  getStateCodeFromGSTIN,
  getStateNameByCode,
  resolveCustomerStateCode,
  determineTaxType,
  isValidStateCode,
} from '../src/utils/gstStates.js';
import { calculateLineItem, calculateInvoiceTotals } from '../src/utils/billingMath.js';
import { generateInvoicePDF } from '../src/utils/pdfGenerator.js';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/index.js');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await prisma.$disconnect();
});

test('IGST State Precedence & Clean 2-Digit Code Rules', () => {
  // Rule 1: GSTIN always wins when valid
  const custWithBoth = {
    name: 'Interstate Business',
    gstin: '27AKBPC4941M1ZA', // Maharashtra (27)
    state: '24', // Gujarat (24) - staff erroneously set 24
  };
  assert.equal(
    resolveCustomerStateCode(custWithBoth),
    '27',
    'GSTIN-derived state (27) MUST win over manual state (24)'
  );

  // Rule 2: Manual state is used as fallback when no GSTIN
  const custManual = {
    name: 'Unregistered Interstate',
    gstin: null,
    state: '27',
  };
  assert.equal(
    resolveCustomerStateCode(custManual),
    '27',
    'Manual state (27) must be used when no GSTIN is present'
  );

  // Default fallback for unregistered local counter sales
  const custCounter = {
    name: 'Walk-in Cash Customer',
    gstin: null,
    state: null,
  };
  assert.equal(
    resolveCustomerStateCode(custCounter),
    '24',
    'Unregistered customer with no state must default to Gujarat (24)'
  );

  // Clean 2-digit code storage & verification
  assert.equal(isValidStateCode('24'), true);
  assert.equal(isValidStateCode('27'), true);
  assert.equal(isValidStateCode('24 - Gujarat'), false, 'Only clean 2-digit code is valid for storage');
  assert.equal(getStateNameByCode('24'), 'Gujarat');
  assert.equal(getStateNameByCode('27'), 'Maharashtra');

  // Tax type determination
  assert.equal(determineTaxType({ customerStateCode: '24', companyGstin: '24AAAAP1234A1Z5' }), 'INTRASTATE');
  assert.equal(determineTaxType({ customerStateCode: '27', companyGstin: '24AAAAP1234A1Z5' }), 'INTERSTATE');
});

test('IGST Billing Math: Interstate single 18% tax vs Intrastate 50/50 split', () => {
  // Test Interstate: 10 units @ 100 with 18% GST -> 180 IGST, 0 CGST, 0 SGST
  const interstateLine = calculateLineItem({
    qty: 10,
    sellingPrice: 100,
    gstRate: 18,
    taxType: 'INTERSTATE',
  });
  assert.equal(interstateLine.taxableValue.toString(), '1000');
  assert.equal(interstateLine.cgstAmount.toString(), '0');
  assert.equal(interstateLine.sgstAmount.toString(), '0');
  assert.equal(interstateLine.igstAmount.toString(), '180');
  assert.equal(interstateLine.amount.toString(), '1180');

  // Test Intrastate: 10 units @ 100 with 18% GST -> 90 CGST, 90 SGST, 0 IGST
  const intrastateLine = calculateLineItem({
    qty: 10,
    sellingPrice: 100,
    gstRate: 18,
    taxType: 'INTRASTATE',
  });
  assert.equal(intrastateLine.taxableValue.toString(), '1000');
  assert.equal(intrastateLine.cgstAmount.toString(), '90');
  assert.equal(intrastateLine.sgstAmount.toString(), '90');
  assert.equal(intrastateLine.igstAmount.toString(), '0');
  assert.equal(intrastateLine.amount.toString(), '1180');

  // Invariant check on Invoice Totals
  const interstateTotals = calculateInvoiceTotals({
    lineCalculations: [interstateLine],
    taxType: 'INTERSTATE',
  });
  assert.equal(interstateTotals.taxType, 'INTERSTATE');
  assert.equal(interstateTotals.taxableTotal.toString(), '1000');
  assert.equal(interstateTotals.cgstTotal.toString(), '0');
  assert.equal(interstateTotals.sgstTotal.toString(), '0');
  assert.equal(interstateTotals.igstTotal.toString(), '180');
  assert.equal(interstateTotals.billAmount.toString(), '1180');
  // Strict Money Invariant: taxableTotal + cgstTotal + sgstTotal + igstTotal + roundOff == billAmount
  assert.equal(
    interstateTotals.taxableTotal
      .plus(interstateTotals.cgstTotal)
      .plus(interstateTotals.sgstTotal)
      .plus(interstateTotals.igstTotal)
      .plus(interstateTotals.roundOff)
      .equals(interstateTotals.billAmount),
    true
  );
});

test('End-to-End Invoice Creation: Intrastate vs Interstate with PDF generation and Sales Report', async () => {
  const unique = Date.now();

  // Ensure Company Settings has a Gujarat GSTIN (24 prefix) without overwriting other fields
  const existingCompany = await prisma.companySettings.findFirst();
  if (existingCompany) {
    if (!existingCompany.gstin || !existingCompany.gstin.startsWith('24')) {
      await prisma.companySettings.update({
        where: { id: existingCompany.id },
        data: { gstin: '24AABCP1234A1Z1' },
      });
    }
  } else {
    await prisma.companySettings.create({
      data: {
        name: 'Prathna Enterprise',
        address: 'Rajkot, Gujarat',
        gstin: '24AABCP1234A1Z1',
        terms: 'Payment due on delivery',
      },
    });
  }

  // 1. Create Product
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: `IGST Test Product ${unique}`,
        hsnCode: '1001',
        gstRate: 18.0,
        purchasePrice: 50.0,
        sellingPrice: 100.0,
        currentStock: 100.0,
      },
    });
    await tx.stockTransaction.create({
      data: {
        productId: p.id,
        quantity: 100.0,
        type: 'PURCHASE',
        reference: 'Initial seed stock for IGST test',
      },
    });
    return p;
  });

  // 2. Create Intrastate Customer (Gujarat, code 24)
  const intraCustomer = await prisma.customer.create({
    data: {
      name: `Intra Customer ${unique}`,
      mobile: '9825000001',
      state: '24',
    },
  });

  // 3. Create Interstate Customer (Maharashtra GSTIN 27 + manual state 24 to test precedence)
  const interCustomer = await prisma.customer.create({
    data: {
      name: `Inter Customer ${unique}`,
      mobile: '9825000002',
      gstin: '27AKBPC4941M1ZA',
      state: '24', // Contradicting manual state: GSTIN 27 must win!
    },
  });

  // Create an admin user to get auth token
  const testUser = await prisma.user.upsert({
    where: { email: 'admin@prathna.com' },
    update: { mustChangePassword: false },
    create: {
      name: 'Admin',
      email: 'admin@prathna.com',
      password: 'hashedpassword',
      mustChangePassword: false,
    },
  });

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@prathna.com', password: 'password123' }),
  });
  const { token } = await loginRes.json();
  assert.ok(token, 'Must receive auth token');

  // 4. Create Intrastate Invoice
  const intraRes = await fetch(`${baseUrl}/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerId: intraCustomer.id,
      items: [{ productId: product.id, qty: 5 }],
    }),
  });
  assert.equal(intraRes.status, 201);
  const intraInvoice = await intraRes.json();
  assert.equal(intraInvoice.taxType, 'INTRASTATE');
  assert.equal(Number(intraInvoice.cgstTotal) > 0, true);
  assert.equal(Number(intraInvoice.sgstTotal) > 0, true);
  assert.equal(Number(intraInvoice.igstTotal), 0);

  // 5. Create Interstate Invoice (precedence test: GSTIN 27 overrides state 24)
  const interRes = await fetch(`${baseUrl}/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerId: interCustomer.id,
      items: [{ productId: product.id, qty: 5 }],
    }),
  });
  assert.equal(interRes.status, 201);
  const interInvoice = await interRes.json();
  assert.equal(interInvoice.taxType, 'INTERSTATE');
  assert.equal(Number(interInvoice.cgstTotal), 0);
  assert.equal(Number(interInvoice.sgstTotal), 0);
  assert.equal(Number(interInvoice.igstTotal) > 0, true);

  // 6. Test PDF Generation for Interstate Invoice
  const pdfRes = await fetch(`${baseUrl}/invoices/${interInvoice.id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  assert.equal(pdfBuffer.slice(0, 4).toString(), '%PDF', 'Must return a valid PDF');

  // 7. Test Sales Report with IGST breakdown
  const reportRes = await fetch(`${baseUrl}/reports/sales`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(reportRes.status, 200);
  const reportData = await reportRes.json();
  assert.ok(reportData.summary);
  assert.equal(Number(reportData.summary.igstTotal) > 0, true, 'Report must contain positive igstTotal');
  assert.equal(Number(reportData.summary.cgstTotal) > 0, true, 'Report must contain positive cgstTotal');
  assert.equal(Number(reportData.summary.sgstTotal) > 0, true, 'Report must contain positive sgstTotal');

  // 8. Test Recent Customers endpoint
  const recentRes = await fetch(`${baseUrl}/customers/recent`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(recentRes.status, 200);
  const recentList = await recentRes.json();
  assert.ok(Array.isArray(recentList));
  assert.equal(recentList.length >= 2, true);
  // Must include the two customers created and invoiced above
  const foundInter = recentList.some((c) => c.id === interCustomer.id);
  assert.equal(foundInter, true, 'Recent customers must include the newly invoiced customer');
});
