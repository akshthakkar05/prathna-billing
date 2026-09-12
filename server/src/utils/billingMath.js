import { Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;

/**
 * Calculates line item values using Prisma.Decimal end-to-end.
 * @param {Object} params
 * @param {string|number|Prisma.Decimal} params.qty
 * @param {string|number|Prisma.Decimal} params.rate (excl. GST)
 * @param {string|number|Prisma.Decimal} params.gstRate (e.g. 18.00)
 */
export function calculateLineItem({ qty, rate, gstRate }) {
  const dQty = new Decimal(qty);
  const dRate = new Decimal(rate);
  const dGstRate = new Decimal(gstRate);

  // Taxable Value = qty * rate
  const taxableValue = dQty.mul(dRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Intra-state GST is split equally into CGST and SGST
  const halfGstRate = dGstRate.div(new Decimal(2));
  const cgstAmount = taxableValue.mul(halfGstRate).div(new Decimal(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const sgstAmount = taxableValue.mul(halfGstRate).div(new Decimal(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Line total
  const amount = taxableValue.plus(cgstAmount).plus(sgstAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    qty: dQty,
    rate: dRate,
    gstRateSnapshot: dGstRate,
    taxableValue,
    cgstAmount,
    sgstAmount,
    amount,
  };
}

/**
 * Calculates complete invoice totals using Prisma.Decimal end-to-end.
 * @param {Array} lineItems Array of results from calculateLineItem
 */
export function calculateInvoiceTotals(lineItems) {
  let taxableTotal = new Decimal(0);
  let cgstTotal = new Decimal(0);
  let sgstTotal = new Decimal(0);

  for (const item of lineItems) {
    taxableTotal = taxableTotal.plus(item.taxableValue);
    cgstTotal = cgstTotal.plus(item.cgstAmount);
    sgstTotal = sgstTotal.plus(item.sgstAmount);
  }

  taxableTotal = taxableTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  cgstTotal = cgstTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  sgstTotal = sgstTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const rawBillTotal = taxableTotal.plus(cgstTotal).plus(sgstTotal);
  // Round off to nearest whole integer
  const roundedBillTotal = rawBillTotal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const roundOff = roundedBillTotal.minus(rawBillTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const billAmount = roundedBillTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    taxableTotal,
    cgstTotal,
    sgstTotal,
    roundOff,
    billAmount,
  };
}
