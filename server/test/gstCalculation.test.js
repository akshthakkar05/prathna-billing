import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { calculateLineItem, calculateInvoiceTotals } from '../src/utils/billingMath.js';

const Decimal = Prisma.Decimal;

test('GST Calculation: Accurate taxable, 50/50 CGST & SGST split, and round-off using Prisma.Decimal', () => {
  // Test case 1: Single item with standard 18% GST
  // Qty: 3, Rate: 350.00
  // Taxable = 3 * 350 = 1050.00
  // CGST 9% = 1050 * 0.09 = 94.50
  // SGST 9% = 1050 * 0.09 = 94.50
  // Line Total = 1050 + 94.50 + 94.50 = 1239.00
  const item1 = calculateLineItem({
    qty: new Decimal('3'),
    rate: new Decimal('350.00'),
    gstRate: new Decimal('18.00'),
  });

  assert.equal(item1.taxableValue.toString(), '1050');
  assert.equal(item1.cgstAmount.toString(), '94.5');
  assert.equal(item1.sgstAmount.toString(), '94.5');
  assert.equal(item1.amount.toString(), '1239');

  // Test case 2: Item with fractional GST and cents
  // Qty: 7, Rate: 42.50, GST: 12%
  // Taxable = 7 * 42.50 = 297.50
  // CGST 6% = 297.50 * 0.06 = 17.85
  // SGST 6% = 297.50 * 0.06 = 17.85
  // Line Total = 297.50 + 17.85 + 17.85 = 333.20
  const item2 = calculateLineItem({
    qty: new Decimal('7'),
    rate: new Decimal('42.50'),
    gstRate: new Decimal('12.00'),
  });

  assert.equal(item2.taxableValue.toString(), '297.5');
  assert.equal(item2.cgstAmount.toString(), '17.85');
  assert.equal(item2.sgstAmount.toString(), '17.85');
  assert.equal(item2.amount.toString(), '333.2');

  // Invoice totals calculation
  const totals = calculateInvoiceTotals([item1, item2]);

  // Taxable Total = 1050 + 297.50 = 1347.50
  assert.equal(totals.taxableTotal.toString(), '1347.5');

  // CGST Total = 94.50 + 17.85 = 112.35
  assert.equal(totals.cgstTotal.toString(), '112.35');

  // SGST Total = 94.50 + 17.85 = 112.35
  assert.equal(totals.sgstTotal.toString(), '112.35');

  // Raw Total = 1347.50 + 112.35 + 112.35 = 1572.20
  // Rounded Bill Amount = 1572.00
  // Round Off = -0.20
  assert.equal(totals.billAmount.toString(), '1572');
  assert.equal(totals.roundOff.toString(), '-0.2');

  // Verify that all return values are instances of Prisma.Decimal
  assert.ok(totals.taxableTotal instanceof Decimal, 'taxableTotal must be Prisma.Decimal');
  assert.ok(totals.cgstTotal instanceof Decimal, 'cgstTotal must be Prisma.Decimal');
  assert.ok(totals.sgstTotal instanceof Decimal, 'sgstTotal must be Prisma.Decimal');
  assert.ok(totals.billAmount instanceof Decimal, 'billAmount must be Prisma.Decimal');
  assert.ok(totals.roundOff instanceof Decimal, 'roundOff must be Prisma.Decimal');
});
