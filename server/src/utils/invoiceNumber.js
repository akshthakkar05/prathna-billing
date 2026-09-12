/**
 * Atomically generates the next sequential invoice number in format INV-<number>.
 * Uses PostgreSQL ON CONFLICT DO UPDATE ... RETURNING to guarantee row-level lock
 * and prevent duplicate numbers under high concurrency.
 *
 * @param {import('@prisma/client').PrismaClient} tx - Active Prisma transaction client
 * @returns {Promise<string>} Next invoice number, e.g. "INV-1001"
 */
export async function getNextInvoiceNumber(tx) {
  const result = await tx.$queryRaw`
    INSERT INTO "InvoiceCounter" ("name", "current")
    VALUES ('invoice', 1001)
    ON CONFLICT ("name")
    DO UPDATE SET "current" = "InvoiceCounter"."current" + 1
    RETURNING "current";
  `;

  const currentNum = result[0].current;
  return `INV-${currentNum}`;
}
