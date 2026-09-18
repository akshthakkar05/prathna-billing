import { Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;

/**
 * Calculates line item values using Prisma.Decimal end-to-end with 6-decimal precision.
 * Supports INTRASTATE (CGST + SGST split) and INTERSTATE (100% IGST).
 *
 * @param {Object} params
 * @param {string|number|Prisma.Decimal} params.qty
 * @param {string|number|Prisma.Decimal} params.rate (excl. GST)
 * @param {string|number|Prisma.Decimal} params.gstRate (e.g. 18.00)
 * @param {'INTRASTATE'|'INTERSTATE'} [params.taxType='INTRASTATE']
 */
export function calculateLineItem({ qty, rate, sellingPrice, gstRate, taxType = 'INTRASTATE' }) {
  const dQty = new Decimal(qty);
  const dRate = new Decimal(rate !== undefined ? rate : sellingPrice);
  const dGstRate = new Decimal(gstRate);
  const cleanTaxType = taxType === 'INTERSTATE' ? 'INTERSTATE' : 'INTRASTATE';

  // Taxable Value = qty * rate (preserving 6-decimal intermediate precision)
  const taxableValue = dQty.mul(dRate).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);

  let cgstAmount = new Decimal(0);
  let sgstAmount = new Decimal(0);
  let igstAmount = new Decimal(0);

  if (cleanTaxType === 'INTERSTATE') {
    // Inter-state: Full GST rate goes to IGST. CGST and SGST are 0.
    igstAmount = taxableValue.mul(dGstRate).div(new Decimal(100)).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  } else {
    // Intra-state: 50/50 split between CGST and SGST. IGST is 0.
    const halfGstRate = dGstRate.div(new Decimal(2));
    cgstAmount = taxableValue.mul(halfGstRate).div(new Decimal(100)).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    sgstAmount = taxableValue.mul(halfGstRate).div(new Decimal(100)).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  }

  // Line total = taxableValue + cgstAmount + sgstAmount + igstAmount
  const amount = taxableValue
    .plus(cgstAmount)
    .plus(sgstAmount)
    .plus(igstAmount)
    .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);

  return {
    qty: dQty,
    rate: dRate,
    gstRateSnapshot: dGstRate,
    taxType: cleanTaxType,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    amount,
  };
}

/**
 * Calculates complete invoice totals using Prisma.Decimal end-to-end.
 * Preserves the identity: taxableTotal + cgstTotal + sgstTotal + igstTotal + roundOff == billAmount.
 *
 * @param {Array|Object} lineItemsOrObj Array of results from calculateLineItem
 * @param {'INTRASTATE'|'INTERSTATE'} [taxTypeParam='INTRASTATE']
 */
export function calculateInvoiceTotals(lineItemsOrObj, taxTypeParam = 'INTRASTATE') {
  let items = lineItemsOrObj;
  let tType = taxTypeParam;

  if (lineItemsOrObj && !Array.isArray(lineItemsOrObj) && typeof lineItemsOrObj === 'object') {
    items = lineItemsOrObj.lineCalculations || lineItemsOrObj.lineItems || [];
    tType = lineItemsOrObj.taxType || taxTypeParam;
  }

  const cleanTaxType = tType === 'INTERSTATE' ? 'INTERSTATE' : 'INTRASTATE';
  let taxableTotal = new Decimal(0);
  let cgstTotal = new Decimal(0);
  let sgstTotal = new Decimal(0);
  let igstTotal = new Decimal(0);

  for (const item of (items || [])) {
    taxableTotal = taxableTotal.plus(item.taxableValue);
    cgstTotal = cgstTotal.plus(item.cgstAmount || 0);
    sgstTotal = sgstTotal.plus(item.sgstAmount || 0);
    igstTotal = igstTotal.plus(item.igstAmount || 0);
  }

  taxableTotal = taxableTotal.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  cgstTotal = cgstTotal.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  sgstTotal = sgstTotal.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  igstTotal = igstTotal.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);

  const rawBillTotal = taxableTotal.plus(cgstTotal).plus(sgstTotal).plus(igstTotal);
  // Round off to nearest whole integer for legal invoice billing (rupees & paise)
  const roundedBillTotal = rawBillTotal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const roundOff = roundedBillTotal.minus(rawBillTotal).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  const billAmount = roundedBillTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    taxType: cleanTaxType,
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    roundOff,
    billAmount,
  };
}

/**
 * Calculates purchase line item values for GST-inclusive or GST-exclusive entry.
 *
 * @param {Object} params
 * @param {string|number|Prisma.Decimal} params.qty
 * @param {string|number|Prisma.Decimal} params.rate (entered rate)
 * @param {string|number|Prisma.Decimal} params.gstRate (e.g. 18.00)
 * @param {boolean} [params.isInclusive=true]
 */
export function calculatePurchaseLineItem({ qty, rate, gstRate, isInclusive = true }) {
  const dQty = new Decimal(qty);
  const dRate = new Decimal(rate);
  const dGstRate = new Decimal(gstRate);
  const inclusive = isInclusive !== false && isInclusive !== 'false';

  let unitTaxable;
  let taxableValue;
  let gstAmount;
  let amount;

  if (inclusive) {
    // GST-inclusive: enteredRate includes GST.
    // unitTaxable = rate / (1 + gstRate/100)
    const factor = new Decimal(1).plus(dGstRate.div(new Decimal(100)));
    unitTaxable = dRate.div(factor).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    taxableValue = dQty.mul(unitTaxable).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    amount = dQty.mul(dRate).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    gstAmount = amount.minus(taxableValue).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  } else {
    // GST-exclusive: enteredRate is taxable value before GST.
    unitTaxable = dRate.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    taxableValue = dQty.mul(dRate).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    gstAmount = taxableValue.mul(dGstRate).div(new Decimal(100)).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    amount = taxableValue.plus(gstAmount).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  }

  return {
    qty: dQty,
    rate: dRate,
    gstRate: dGstRate,
    isInclusive: inclusive,
    unitTaxable,
    taxableValue,
    gstAmount,
    amount,
  };
}

