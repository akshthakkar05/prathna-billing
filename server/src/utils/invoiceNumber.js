/**
 * Gets the 4-digit year dynamically from a date (e.g. 2026, 2027, etc.).
 * @param {Date|string} [date]
 * @returns {number}
 */
export function getInvoiceYear(date = new Date()) {
  const d = date ? new Date(date) : new Date();
  return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
}

/**
 * Atomically generates the next sequential invoice number in format INV/<year>/<number> (e.g. "INV/2026/1001").
 * The year is dynamically computed from the invoice date.
 * Uses PostgreSQL ON CONFLICT DO UPDATE ... RETURNING to guarantee row-level lock
 * and prevent duplicate numbers under high concurrency.
 *
 * @param {import('@prisma/client').PrismaClient} tx - Active Prisma transaction client
 * @param {Date|string} [invoiceDate] - Optional invoice date
 * @returns {Promise<string>} Next invoice number, e.g. "INV/2026/1001"
 */
export async function getNextInvoiceNumber(tx, invoiceDate = new Date()) {
  const result = await tx.$queryRaw`
    INSERT INTO "InvoiceCounter" ("name", "current")
    VALUES ('invoice', 1001)
    ON CONFLICT ("name")
    DO UPDATE SET "current" = "InvoiceCounter"."current" + 1
    RETURNING "current";
  `;

  const currentNum = result[0].current;
  const year = getInvoiceYear(invoiceDate);
  return `INV/${year}/${currentNum}`;
}


