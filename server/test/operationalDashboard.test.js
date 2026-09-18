import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/index.js');
const { default: prisma } = await import('../src/db.js');

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
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await prisma.$disconnect();
});

test('Operational Dashboard & Sales Trend Suite', async (t) => {
  await t.test('GET /dashboard/summary returns operational metrics without receivables or outstanding fields', async () => {
    const res = await fetch(`${baseUrl}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    // Verify presence of operational fields
    assert.ok(data.periodSales, 'Must have periodSales');
    assert.equal(data.periodSales.range, 'today');
    assert.ok(data.stockSummary, 'Must have stockSummary');
    assert.ok(Array.isArray(data.stockOverview), 'Must have stockOverview array');
    assert.ok(Array.isArray(data.recentInvoices), 'Must have recentInvoices array');

    // Verify outstanding receivables & payables metrics
    assert.ok(data.outstanding, 'Must have outstanding');
    assert.ok(data.outstanding.totalReceivables !== undefined, 'Must have totalReceivables');
    assert.ok(data.outstanding.totalPayables !== undefined, 'Must have totalPayables');
    assert.ok(data.outstanding.unpaidInvoicesCount !== undefined, 'Must have unpaidInvoicesCount');
    assert.ok(data.outstanding.unpaidPurchasesCount !== undefined, 'Must have unpaidPurchasesCount');

    // Verify stock status calculation
    for (const item of data.stockOverview) {
      assert.ok(['Healthy', 'Low'].includes(item.status), 'Stock status must be Healthy or Low');
    }
  });

  await t.test('GET /dashboard/summary?range=this_month computes period sales for current month', async () => {
    const res = await fetch(`${baseUrl}/dashboard/summary?range=this_month`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.periodSales.range, 'this_month');
    assert.equal(data.periodSales.rangeLabel, "This Month's Sales");
  });

  await t.test('GET /dashboard/sales-trend?range=7d returns 7 continuous day buckets', async () => {
    const res = await fetch(`${baseUrl}/dashboard/sales-trend?range=7d`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.range, '7d');
    assert.equal(data.rangeLabel, 'Last 7 Days');
    assert.ok(Array.isArray(data.trend), 'Trend must be an array');
    assert.equal(data.trend.length, 7, '7d range must return exactly 7 daily buckets');

    for (const b of data.trend) {
      assert.ok(b.date, 'Bucket must have date');
      assert.ok(b.label, 'Bucket must have label');
      assert.ok(b.weekday, 'Bucket must have weekday');
      assert.ok(typeof b.amount === 'number', 'Amount must be number');
      assert.ok(typeof b.count === 'number', 'Count must be number');
    }
  });

  await t.test('GET /dashboard/sales-trend?range=30d returns 30 continuous day buckets', async () => {
    const res = await fetch(`${baseUrl}/dashboard/sales-trend?range=30d`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.range, '30d');
    assert.equal(data.trend.length, 30, '30d range must return exactly 30 daily buckets');
  });
});
