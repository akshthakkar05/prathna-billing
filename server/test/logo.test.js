import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/index.js');
const { default: prisma } = await import('../src/db.js');
const { generateInvoicePDF } = await import('../src/utils/pdfGenerator.js');

let server;
let baseUrl;
let token;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Login to get auth token
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@prathna.com', password: 'password123' }),
  });
  const data = await res.json();
  token = data.token;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  // Restore real Prathna logo file and database settings
  try {
    const fs = await import('fs');
    const path = await import('path');
    const logoDir = path.resolve('assets/logo');
    const prathnaPath = path.join(logoDir, 'prathna-logo.png');
    const companyPath = path.join(logoDir, 'company-logo.png');
    if (fs.existsSync(prathnaPath)) {
      fs.copyFileSync(prathnaPath, companyPath);
    }
  } catch (err) {
    console.warn('Failed to restore company-logo.png in test.after:', err);
  }

  await prisma.companySettings.updateMany({
    data: {
      name: 'Prathna Enterprises',
      logoUrl: '/assets/logo/prathna-logo.png',
    },
  });
  await prisma.$disconnect();
});

test('Company Logo, Static Assets & Unauthenticated Branding Suite', async (t) => {
  // 1. Unauthenticated access to /assets/logo/prathna-logo.png
  await t.test('Unauthenticated request to /assets/logo/prathna-logo.png succeeds with 200', async () => {
    const res = await fetch(`${baseUrl}/assets/logo/prathna-logo.png`);
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.match(contentType, /image\/(png|x-png)/);
  });

  // 2. Unauthenticated access to /auth/status returns public branding
  await t.test('Unauthenticated GET /auth/status returns hasUsers and company branding', async () => {
    const res = await fetch(`${baseUrl}/auth/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data.hasUsers === 'boolean');
    assert.ok(data.company);
    assert.ok(data.company.name);
    assert.ok(data.company.logoUrl !== undefined);
  });

  // 3. Authenticated POST /settings/logo uploads base64 image and appends cache buster ?v=
  await t.test('Authenticated POST /settings/logo uploads base64 image and adds cache buster ?v=', async () => {
    assert.ok(token, 'Must have valid token');
    const tinyPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await fetch(`${baseUrl}/settings/logo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: tinyPngBase64 }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.match(data.logoUrl, /\/assets\/logo\/company-logo\.png\?v=\d+/);

    const settings = await prisma.companySettings.findFirst();
    assert.match(settings.logoUrl, /\/assets\/logo\/company-logo\.png\?v=\d+/);
  });

  // 4. PDF Generation with logo succeeds
  await t.test('PDF generator renders successfully when logo is set', async () => {
    const settings = await prisma.companySettings.findFirst();
    const dummyInvoice = {
      invoiceNumber: 'INV-TEST-LOGO',
      invoiceDate: new Date(),
      paymentStatus: 'PAID',
      taxType: 'INTRASTATE',
      taxableTotal: 1000,
      cgstTotal: 90,
      sgstTotal: 90,
      igstTotal: 0,
      roundOff: 0,
      billAmount: 1180,
      customer: {
        name: 'Test Customer',
        address: 'Ahmedabad, Gujarat',
        gstin: '24AAAAA0000A1Z5',
        state: '24',
      },
      items: [
        {
          descriptionSnapshot: 'Absolute Magic Locker – Android',
          hsnSnapshot: '998314',
          qty: 1,
          rate: 1000,
          gstRateSnapshot: 18,
          taxableValue: 1000,
          cgstAmount: 90,
          sgstAmount: 90,
          igstAmount: 0,
          amount: 1180,
        },
      ],
    };

    const pdfBuffer = await generateInvoicePDF(dummyInvoice, settings);
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 1000);
    assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
  });

  // 5. DELETE /settings/logo clears logoUrl to null
  await t.test('DELETE /settings/logo clears logoUrl to null', async () => {
    const res = await fetch(`${baseUrl}/settings/logo`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.logoUrl, null);

    const settings = await prisma.companySettings.findFirst();
    assert.equal(settings.logoUrl, null);
  });

  // 6. PDF Generation without logo falls back cleanly to text-only header
  await t.test('PDF generator renders cleanly with text-only header when logo is null', async () => {
    const settings = await prisma.companySettings.findFirst();
    assert.equal(settings.logoUrl, null);

    const dummyInvoice = {
      invoiceNumber: 'INV-TEST-FALLBACK',
      invoiceDate: new Date(),
      paymentStatus: 'PAID',
      taxType: 'INTRASTATE',
      taxableTotal: 1000,
      cgstTotal: 90,
      sgstTotal: 90,
      igstTotal: 0,
      roundOff: 0,
      billAmount: 1180,
      customer: {
        name: 'Test Customer Fallback',
        address: 'Ahmedabad, Gujarat',
        gstin: '24AAAAA0000A1Z5',
        state: '24',
      },
      items: [],
    };

    const pdfBuffer = await generateInvoicePDF(dummyInvoice, settings);
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 1000);
    assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
  });
});
