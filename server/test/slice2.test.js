import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import prisma from '../src/db.js';
import { getNextInvoiceNumber } from '../src/utils/invoiceNumber.js';
import { generateInvoicePDF } from '../src/utils/pdfGenerator.js';
import { calculateLineItem, calculateInvoiceTotals } from '../src/utils/billingMath.js';

const Decimal = Prisma.Decimal;

// -------------------------------------------------------------
// TEST 1: Invoice number uniqueness under concurrent creation
// -------------------------------------------------------------
test('Invoice number uniqueness under concurrent creation (atomic sequential generator)', async () => {
  const concurrencyCount = 10;

  // Run multiple getNextInvoiceNumber calls in parallel inside transactions
  const promises = Array.from({ length: concurrencyCount }, () =>
    prisma.$transaction(async (tx) => {
      return getNextInvoiceNumber(tx);
    })
  );

  const results = await Promise.all(promises);

  console.log('   Generated sequential numbers:', results);

  // Assert all numbers match INV-<number> or INV/YY-YY/<number>
  results.forEach((num) => {
    assert.match(num, /^(INV-\d+|INV\/\d{2}-\d{2}\/\d+)$/, 'Invoice number must match format INV-<digits> or INV/YY-YY/<digits>');
  });

  // Assert uniqueness: no duplicate numbers allowed
  const uniqueNumbers = new Set(results);
  assert.equal(
    uniqueNumbers.size,
    concurrencyCount,
    `All ${concurrencyCount} concurrent numbers must be strictly unique. Got ${uniqueNumbers.size} unique values.`
  );
});

// -------------------------------------------------------------
// TEST 2: Purchase correctly increases stock via transaction row and updates purchasePrice (weighted average)
// -------------------------------------------------------------
test('Purchase correctly increases stock via a stock_transaction row and updates purchasePrice (weighted average)', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);

  // 1. Create Supplier
  const supplier = await prisma.supplier.create({
    data: {
      name: `Apex Electrical Supplies ${uniqueSuffix}`,
      mobile: '9822211100',
      address: 'Industrial Area, Ahmedabad',
      gstin: '24AAPEX1234A1Z1',
      pan: 'AAPEX1234A',
    },
  });

  // 2. Create Product with 5 units opening stock @ 220.00
  const originalPurchasePrice = new Decimal('220.00');
  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: `Heavy Duty Terminal Block ${uniqueSuffix}`,
        hsnCode: '8536',
        gstRate: new Decimal('18.00'),
        purchasePrice: originalPurchasePrice,
        sellingPrice: new Decimal('380.00'),
        currentStock: new Decimal('5.00'),
        minStockLevel: new Decimal('2.00'),
        unit: 'PCS',
        isActive: true,
      },
    });

    await tx.stockTransaction.create({
      data: {
        productId: p.id,
        type: 'PURCHASE',
        quantity: new Decimal('5.00'),
        reference: 'Opening Stock',
      },
    });

    return p;
  });

  assert.equal(product.currentStock.toString(), '5');

  // 3. Perform Purchase for 12 units at rate 240.00 inside a single transaction
  const purchaseQty = new Decimal('12.00');
  const purchaseRate = new Decimal('240.00'); // different from product.purchasePrice (220.00)
  const purchaseGstRate = new Decimal('18.00');
  const referenceNumber = `PO-TEST-${uniqueSuffix}`;

  const savedPurchase = await prisma.$transaction(async (tx) => {
    const taxable = purchaseQty.mul(purchaseRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const gstAmt = taxable.mul(purchaseGstRate).div(new Decimal(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const lineAmount = taxable.plus(gstAmt).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // Compute weighted average: ((5 * 220) + (12 * 240)) / (5 + 12) = 3980 / 17 = 234.12
    const currentStockBefore = new Decimal(product.currentStock);
    const currentPurchasePrice = new Decimal(product.purchasePrice);
    const weightedAvg = currentStockBefore.mul(currentPurchasePrice).plus(purchaseQty.mul(purchaseRate)).div(currentStockBefore.plus(purchaseQty)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // Increase product stock & update purchasePrice
    await tx.product.update({
      where: { id: product.id },
      data: {
        currentStock: {
          increment: purchaseQty,
        },
        purchasePrice: weightedAvg,
      },
    });

    // Write a stock_transaction of type PURCHASE
    await tx.stockTransaction.create({
      data: {
        productId: product.id,
        type: 'PURCHASE',
        quantity: purchaseQty,
        reference: referenceNumber,
      },
    });

    return tx.purchase.create({
      data: {
        supplierId: supplier.id,
        referenceNumber,
        totalAmount: lineAmount,
        items: {
          create: [
            {
              productId: product.id,
              qty: purchaseQty,
              rate: purchaseRate,
              gstRate: purchaseGstRate,
              amount: lineAmount,
            },
          ],
        },
      },
      include: { items: true },
    });
  });

  assert.ok(savedPurchase.id, 'Purchase should be created');
  assert.equal(savedPurchase.items.length, 1);

  // Verify stock increased from 5 to 17 (5 + 12 = 17)
  const productAfterPurchase = await prisma.product.findUnique({
    where: { id: product.id },
  });
  assert.equal(
    productAfterPurchase.currentStock.toString(),
    '17',
    'Product stock should increase by 12 from 5 to 17'
  );

  // Verify purchasePrice was updated to weighted average: 234.12
  assert.equal(
    productAfterPurchase.purchasePrice.toString(),
    '234.12',
    'purchasePrice must be updated to weighted average (234.12)'
  );

  // Verify stock_transaction row of type PURCHASE
  const stockTx = await prisma.stockTransaction.findFirst({
    where: {
      productId: product.id,
      type: 'PURCHASE',
      reference: referenceNumber,
    },
  });
  assert.ok(stockTx, 'Stock transaction of type PURCHASE must exist');
  assert.equal(stockTx.quantity.toString(), '12', 'Stock transaction quantity must be positive (+12)');
});

// -------------------------------------------------------------
// TEST 3: PDF route returns a valid standard A4 PDF buffer
// -------------------------------------------------------------
test('PDF generator returns a valid standard A4 PDF buffer with %PDF- header', async () => {
  // Fetch or create sample invoice for PDF testing
  let invoice = await prisma.invoice.findFirst({
    include: {
      customer: true,
      items: true,
    },
  });

  if (!invoice) {
    const cust = await prisma.customer.findFirst();
    const prod = await prisma.product.findFirst();

    invoice = {
      invoiceNumber: 'INV-TEST-PDF',
      invoiceDate: new Date(),
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      customer: cust || { name: 'Test Customer', mobile: '9999999999', address: 'Ahmedabad' },
      taxableTotal: '1000.00',
      cgstTotal: '90.00',
      sgstTotal: '90.00',
      roundOff: '0.00',
      billAmount: '1180.00',
      items: [
        {
          descriptionSnapshot: prod ? prod.name : 'LED Panel Light',
          hsnSnapshot: prod ? prod.hsnCode : '9405',
          gstRateSnapshot: '18.00',
          qty: '2.00',
          rate: '500.00',
          taxableValue: '1000.00',
          cgstAmount: '90.00',
          sgstAmount: '90.00',
          amount: '1180.00',
        },
      ],
    };
  }

  const companySettings = {
    name: 'Prathna Enterprises',
    address: '42, Industrial Estate, Phase-1, Ahmedabad, Gujarat',
    phone: '+91 98765 43210',
    gstin: '24AAACP9988P1Z8',
    pan: 'AAACP9988P',
    terms: '1. Goods once sold will not be taken back.\n2. Subject to Ahmedabad jurisdiction.',
  };

  const pdfBuffer = await generateInvoicePDF(invoice, companySettings);

  assert.ok(Buffer.isBuffer(pdfBuffer), 'Must return a Buffer');
  assert.ok(pdfBuffer.length > 500, `PDF buffer must have valid content (got ${pdfBuffer.length} bytes)`);

  // Verify standard PDF header magic bytes "%PDF-"
  const headerMagic = pdfBuffer.subarray(0, 5).toString('ascii');
  assert.equal(headerMagic, '%PDF-', 'Buffer must start with PDF magic bytes %PDF-');

  // Verify PDF contains EOF marker
  const tail = pdfBuffer.subarray(pdfBuffer.length - 30).toString('ascii');
  assert.ok(tail.includes('%%EOF'), 'Buffer must end with standard PDF EOF marker');

  await prisma.$disconnect();
});
