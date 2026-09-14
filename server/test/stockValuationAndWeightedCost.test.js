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

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

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

test('Weighted Average Cost: starting stock 50 @ ₹150, purchase 30 more @ ₹180 -> purchasePrice is exactly ₹161.25', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  // 1. Create Supplier
  const supplier = await prisma.supplier.create({
    data: {
      name: `Wholesale Distributor ${uniqueSuffix}`,
      mobile: '9898000000',
      address: 'Ahmedabad',
    },
  });

  // 2. Create Product with 50 units @ purchasePrice 150.00, sellingPrice 250.00
  const product = await prisma.product.create({
    data: {
      name: `Weighted Test Item ${uniqueSuffix}`,
      hsnCode: '998314',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('150.00'),
      sellingPrice: new Decimal('250.00'),
      currentStock: new Decimal('50.00'),
      minStockLevel: new Decimal('5.00'),
      unit: 'PCS',
      isActive: true,
    },
  });

  // 3. Purchase 30 units @ ₹180 via POST /purchases endpoint
  const res = await fetch(`${baseUrl}/purchases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      supplierId: supplier.id,
      referenceNumber: `PO-WGT-${uniqueSuffix}`,
      items: [
        {
          productId: product.id,
          qty: 30,
          rate: 180,
          gstRate: 18,
        },
      ],
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 201, `Purchase failed: ${JSON.stringify(data)}`);

  // 4. Verify updated Product in database
  const updatedProduct = await prisma.product.findUnique({
    where: { id: product.id },
  });

  // Stock should be 50 + 30 = 80
  assert.equal(updatedProduct.currentStock.toString(), '80', 'Current stock should be 80');

  // purchasePrice = ((50 * 150) + (30 * 180)) / 80 = (7500 + 5400) / 80 = 12900 / 80 = 161.25
  assert.equal(updatedProduct.purchasePrice.toString(), '161.25', 'purchasePrice should be exactly 161.25');

  // sellingPrice should be completely untouched (250.00)
  assert.equal(updatedProduct.sellingPrice.toString(), '250', 'sellingPrice must remain 250.00');
});

test('Weighted Average Cost: initial stock 0 (or empty), purchase sets purchasePrice directly without blending', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  const supplier = await prisma.supplier.create({
    data: {
      name: `Direct Supplier ${uniqueSuffix}`,
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `Zero Stock Item ${uniqueSuffix}`,
      hsnCode: '998314',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('0.00'),
      sellingPrice: new Decimal('500.00'),
      currentStock: new Decimal('0.00'),
      minStockLevel: new Decimal('0.00'),
      unit: 'PCS',
      isActive: true,
    },
  });

  const res = await fetch(`${baseUrl}/purchases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      supplierId: supplier.id,
      referenceNumber: `PO-ZERO-${uniqueSuffix}`,
      items: [
        {
          productId: product.id,
          qty: 25,
          rate: 320,
          gstRate: 18,
        },
      ],
    }),
  });

  assert.equal(res.status, 201);

  const updatedProduct = await prisma.product.findUnique({
    where: { id: product.id },
  });

  assert.equal(updatedProduct.currentStock.toString(), '25');
  assert.equal(updatedProduct.purchasePrice.toString(), '320', 'purchasePrice should be set directly to purchase rate 320');
  assert.equal(updatedProduct.sellingPrice.toString(), '500', 'sellingPrice must remain 500');
});

test('Stock Valuation Report: GET /reports/stock strictly asserts stockValuation === currentStock * purchasePrice', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  // Create a product with known stock, purchasePrice, and different sellingPrice
  const product = await prisma.product.create({
    data: {
      name: `Valuation Test Item ${uniqueSuffix}`,
      hsnCode: '998314',
      gstRate: new Decimal('18.00'),
      purchasePrice: new Decimal('120.50'),
      sellingPrice: new Decimal('299.00'),
      currentStock: new Decimal('40.00'),
      minStockLevel: new Decimal('5.00'),
      unit: 'PCS',
      isActive: true,
    },
  });

  const res = await fetch(`${baseUrl}/reports/stock`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  const data = await res.json();

  const matched = data.products.find((p) => p.id === product.id);
  assert.ok(matched, 'Created product should be present in stock report');

  // Math: 40 * 120.50 = 4820
  const expectedValuation = new Decimal('40').mul(new Decimal('120.50')).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(); // '4820'
  assert.equal(matched.purchasePrice, '120.5');
  assert.equal(matched.sellingPrice, '299');
  assert.equal(matched.currentStock, '40');
  assert.equal(matched.stockValue, expectedValuation, 'stockValue must strictly equal currentStock * purchasePrice');
  assert.equal(matched.lineValuation, expectedValuation, 'lineValuation must strictly equal currentStock * purchasePrice');

  // Must NOT equal selling price valuation (40 * 299 = 11960)
  const sellingValuation = new Decimal('40').mul(new Decimal('299.00')).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
  assert.notEqual(matched.stockValue, sellingValuation, 'Valuation must not compute from sellingPrice');
});
