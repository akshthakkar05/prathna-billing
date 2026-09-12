import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { calculateLineItem, calculateInvoiceTotals } from '../src/utils/billingMath.js';
import { numberToIndianWords } from '../src/utils/pdfGenerator.js';

const Decimal = Prisma.Decimal;

test('Calculation 1: 12-item mixed-slab invoice with varied rates, quantities, and GST rates', () => {
  const itemsInput = [
    { qty: '3.5', rate: '149.99', gstRate: '18.00' },
    { qty: '7', rate: '29.50', gstRate: '5.00' },
    { qty: '13', rate: '485.75', gstRate: '12.00' },
    { qty: '0.5', rate: '1200.00', gstRate: '18.00' },
    { qty: '25', rate: '3.25', gstRate: '0.00' },
    { qty: '2', rate: '999.90', gstRate: '28.00' },
    { qty: '11.25', rate: '45.80', gstRate: '18.00' },
    { qty: '1', rate: '14500.00', gstRate: '18.00' },
    { qty: '8', rate: '88.88', gstRate: '12.00' },
    { qty: '4.75', rate: '210.35', gstRate: '5.00' },
    { qty: '19', rate: '15.00', gstRate: '0.00' },
    { qty: '6', rate: '777.77', gstRate: '18.00' },
  ];

  assert.equal(itemsInput.length, 12, 'Must have exactly 12 items');

  const lineCalculations = itemsInput.map((item) => calculateLineItem(item));

  // Verify line item consistency: taxable + cgst + sgst == line amount
  for (let i = 0; i < lineCalculations.length; i++) {
    const line = lineCalculations[i];
    const sumTax = line.taxableValue.plus(line.cgstAmount).plus(line.sgstAmount);
    assert.equal(
      sumTax.toString(),
      line.amount.toString(),
      `Line item ${i + 1} sum of tax and taxable must equal line amount`
    );
    assert.equal(
      line.cgstAmount.toString(),
      line.sgstAmount.toString(),
      `Line item ${i + 1} CGST must equal SGST for intra-state GST`
    );
  }

  const totals = calculateInvoiceTotals(lineCalculations);

  // Assert invoice balance identity: taxableTotal + cgstTotal + sgstTotal + roundOff == billAmount
  const calculatedSum = totals.taxableTotal
    .plus(totals.cgstTotal)
    .plus(totals.sgstTotal)
    .plus(totals.roundOff);

  assert.equal(
    calculatedSum.toString(),
    totals.billAmount.toString(),
    'taxableTotal + cgstTotal + sgstTotal + roundOff must strictly equal billAmount'
  );

  // Round off must be within [-0.50, 0.50]
  assert.ok(
    totals.roundOff.gte(new Decimal('-0.50')) && totals.roundOff.lte(new Decimal('0.50')),
    `Round off (${totals.roundOff.toString()}) must be between -0.50 and +0.50`
  );

  // billAmount must have .00 decimal part (rounded to nearest integer)
  const isWholeInteger = totals.billAmount.mod(new Decimal(1)).equals(new Decimal(0));
  assert.ok(isWholeInteger, `Bill amount (${totals.billAmount.toString()}) must be rounded to a whole integer`);
});

test('Calculation 2: Tiny invoice (qty=1, rate=₹1, GST=18%)', () => {
  const line = calculateLineItem({ qty: '1', rate: '1.00', gstRate: '18.00' });

  assert.equal(line.taxableValue.toString(), '1');
  assert.equal(line.cgstAmount.toString(), '0.09');
  assert.equal(line.sgstAmount.toString(), '0.09');
  assert.equal(line.amount.toString(), '1.18');

  const totals = calculateInvoiceTotals([line]);

  assert.equal(totals.taxableTotal.toString(), '1');
  assert.equal(totals.cgstTotal.toString(), '0.09');
  assert.equal(totals.sgstTotal.toString(), '0.09');
  assert.equal(totals.roundOff.toString(), '-0.18');
  assert.equal(totals.billAmount.toString(), '1');

  // Verify number to words conversion
  const words = numberToIndianWords(totals.billAmount);
  assert.equal(words, 'Rupees One Only');
});

test('Calculation 3: Huge invoice (qty=500, rate=₹45,000, GST=18%) + Indian words conversion', () => {
  const line = calculateLineItem({ qty: '500', rate: '45000.00', gstRate: '18.00' });

  // Taxable: 500 * 45,000 = 2,25,00,000 (2.25 Crore)
  assert.equal(line.taxableValue.toString(), '22500000');
  // CGST: 9% of 2,25,00,000 = 20,25,000 (20.25 Lakh)
  assert.equal(line.cgstAmount.toString(), '2025000');
  // SGST: 9% of 2,25,00,000 = 20,25,000
  assert.equal(line.sgstAmount.toString(), '2025000');
  // Amount: 2,65,50,000
  assert.equal(line.amount.toString(), '26550000');

  const totals = calculateInvoiceTotals([line]);
  assert.equal(totals.taxableTotal.toString(), '22500000');
  assert.equal(totals.cgstTotal.toString(), '2025000');
  assert.equal(totals.sgstTotal.toString(), '2025000');
  assert.equal(totals.roundOff.toString(), '0');
  assert.equal(totals.billAmount.toString(), '26550000');

  // Verify Indian numbering words conversion: 2 Crore 65 Lakh 50 Thousand
  const words = numberToIndianWords(totals.billAmount);
  assert.equal(words, 'Rupees Two Crore Sixty Five Lakh Fifty Thousand Only');
});
