import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/index.js');
const { default: prisma } = await import('../src/db.js');

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

test('Stock Routes Suite: /stock and /stock/adjust authentication and operations', async () => {
  // 1. Unauthenticated requests to /stock must be rejected with 401
  const unauthRes = await fetch(`${baseUrl}/stock`);
  assert.equal(unauthRes.status, 401);

  // 2. Login to get valid auth token
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@prathna.com', password: 'password123' }),
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  const token = loginData.token;

  // 3. Authenticated GET /stock returns list of transactions
  const stockRes = await fetch(`${baseUrl}/stock`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(stockRes.status, 200);
  const transactions = await stockRes.json();
  assert.ok(Array.isArray(transactions));

  // 4. Create or find a test product to adjust
  const product = await prisma.product.findFirst();
  assert.ok(product, 'Product must exist in test database');

  const initialStock = Number(product.currentStock);

  // 5. Authenticated POST /stock/adjust adjusts stock and records transaction
  const adjustRes = await fetch(`${baseUrl}/stock/adjust`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      productId: product.id,
      quantity: 5,
      type: 'ADJUSTMENT',
      reference: 'Manual audit test adjustment',
    }),
  });

  assert.equal(adjustRes.status, 201);
  const adjustData = await adjustRes.json();
  assert.equal(Number(adjustData.product.currentStock), initialStock + 5);
  assert.equal(Number(adjustData.transaction.quantity), 5);
  assert.equal(adjustData.transaction.type, 'ADJUSTMENT');

  // 6. Revert the adjustment cleanly
  const revertRes = await fetch(`${baseUrl}/stock/adjust`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      productId: product.id,
      quantity: -5,
      type: 'ADJUSTMENT',
      reference: 'Revert test adjustment',
    }),
  });
  assert.equal(revertRes.status, 201);
});
