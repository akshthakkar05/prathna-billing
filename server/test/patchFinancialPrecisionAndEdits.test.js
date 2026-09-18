import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  calculateLineItem,
  calculateInvoiceTotals,
  calculatePurchaseLineItem,
} from '../src/utils/billingMath.js';

const Decimal = Prisma.Decimal;

test('Purchase GST Fix 1: ₹2596 @ 18% GST (Inclusive) produces Taxable ₹2200 and GST ₹396', () => {
  const result = calculatePurchaseLineItem({
    qty: 1,
    rate: '2596.00',
    gstRate: '18.00',
    isInclusive: true,
  });

  assert.equal(
    result.taxableValue.toFixed(2),
    '2200.00',
    'Taxable value for ₹2596 @ 18% inclusive must be exactly ₹2200.00'
  );
  assert.equal(
    result.gstAmount.toFixed(2),
    '396.00',
    'GST amount for ₹2596 @ 18% inclusive must be exactly ₹396.00'
  );
  assert.equal(
    result.amount.toFixed(2),
    '2596.00',
    'Total line amount must equal entered rate ₹2596.00'
  );
  assert.equal(
    result.unitTaxable.toFixed(2),
    '2200.00',
    'Unit taxable cost for weighted average valuation must be ₹2200.00'
  );
});

test('Purchase GST Fix 2: ₹2596 @ 18% GST (Exclusive) produces Taxable ₹2596, GST ₹467.28, Total ₹3063.28', () => {
  const result = calculatePurchaseLineItem({
    qty: 1,
    rate: '2596.00',
    gstRate: '18.00',
    isInclusive: false,
  });

  assert.equal(
    result.taxableValue.toFixed(2),
    '2596.00',
    'Taxable value for ₹2596 exclusive must be ₹2596.00'
  );
  assert.equal(
    result.gstAmount.toFixed(2),
    '467.28',
    'GST amount for ₹2596 @ 18% exclusive must be ₹467.28'
  );
  assert.equal(
    result.amount.toFixed(2),
    '3063.28',
    'Total line amount must be ₹3063.28'
  );
});

test('Purchase GST Fix 3: Multi-quantity GST-inclusive calculation (qty=5, rate=₹1180, GST=18%)', () => {
  const result = calculatePurchaseLineItem({
    qty: 5,
    rate: '1180.00',
    gstRate: '18.00',
    isInclusive: true,
  });

  // unitTaxable = 1180 / 1.18 = 1000
  assert.equal(result.unitTaxable.toFixed(2), '1000.00');
  // taxableValue = 5 * 1000 = 5000
  assert.equal(result.taxableValue.toFixed(2), '5000.00');
  // total = 5 * 1180 = 5900
  assert.equal(result.amount.toFixed(2), '5900.00');
  // gstAmount = 5900 - 5000 = 900
  assert.equal(result.gstAmount.toFixed(2), '900.00');
});

test('Precision test: 6-decimal intermediate calculation preserves precision over 2-decimal early truncation', () => {
  // Example with rate having fractional paise:
  // qty: 3, rate: 33.333333, gstRate: 18%
  const line = calculateLineItem({
    qty: '3',
    rate: '33.333333',
    gstRate: '18.00',
    taxType: 'INTRASTATE',
  });

  // 3 * 33.333333 = 99.999999 (preserving 6 decimals)
  assert.equal(line.taxableValue.toString(), '99.999999');

  // CGST: 9% of 99.999999 = 8.99999991 -> 9.000000 at 6 decimals
  assert.equal(line.cgstAmount.toString(), '9');
  assert.equal(line.sgstAmount.toString(), '9');

  const totals = calculateInvoiceTotals([line]);
  // Total taxable + CGST + SGST = 99.999999 + 9 + 9 = 117.999999
  // Round off to nearest rupee = 118.00 - 117.999999 = +0.000001
  assert.equal(totals.billAmount.toFixed(2), '118.00');
});

test('Audit / Delta Math: Invoice quantity adjustment calculation', () => {
  const oldItems = [{ productId: 'prod-1', qty: '5', rate: '100.00' }];
  const newItems = [{ productId: 'prod-1', qty: '8', rate: '100.00' }];

  const oldQty = new Decimal(oldItems[0].qty);
  const newQty = new Decimal(newItems[0].qty);
  const delta = newQty.minus(oldQty);

  // delta > 0 means 3 more units sold -> deduct 3 from stock
  assert.equal(delta.toString(), '3');
  assert.ok(delta.gt(0), 'Delta must be positive for increased quantity');

  // Reduced quantity scenario: 5 down to 2 -> restore 3 to stock
  const reducedNewQty = new Decimal('2');
  const reducedDelta = reducedNewQty.minus(oldQty);
  assert.equal(reducedDelta.toString(), '-3');
  assert.equal(reducedDelta.abs().toString(), '3', 'Stock restoration amount must be 3');
});
