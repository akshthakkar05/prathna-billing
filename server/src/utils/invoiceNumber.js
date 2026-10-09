/**
 * Computes Indian Financial Year format (e.g. "26-27" for 2026-2027 FY).
 * In India, FY runs from April 1st to March 31st.
 * @param {Date|string} [date]
 * @returns {string} e.g. "26-27"
 */
export function getFinancialYearString(date = new Date()) {
  const d = date ? new Date(date) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const month = validDate.getMonth(); // 0 = Jan, 3 = Apr
  const year = validDate.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const startYY = String(startYear).slice(-2);
  const endYY = String(endYear).slice(-2);
  return `${startYY}-${endYY}`;
}

/**
 * Atomically generates the next sequential invoice number in format INV-<number> (e.g. "INV-056", "INV-057").
 * Formats sequence numbers with minimum 3-digit padding.
 * Uses PostgreSQL ON CONFLICT DO UPDATE ... RETURNING to guarantee row-level lock
 * and prevent duplicate numbers under high concurrency.
 *
 * @param {import('@prisma/client').PrismaClient} tx - Active Prisma transaction client
 * @returns {Promise<string>} Next invoice number, e.g. "INV-056"
 */
export async function getNextInvoiceNumber(tx) {
  const result = await tx.$queryRaw`
    INSERT INTO "InvoiceCounter" ("name", "current")
    VALUES ('invoice', 56)
    ON CONFLICT ("name")
    DO UPDATE SET "current" = "InvoiceCounter"."current" + 1
    RETURNING "current";
  `;

  const currentNum = result[0].current;
  const paddedNum = String(currentNum).padStart(3, '0');
  return `INV-${paddedNum}`;
}




