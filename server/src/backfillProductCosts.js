import prisma from './db.js';

/**
 * One-time backfill script:
 * Sets each product's purchasePrice to the rate of its last recorded purchase item,
 * if any purchases exist in the database.
 * Does not hardcode any guessed numbers.
 */
async function backfillProductCosts() {
  console.log('[backfill] Checking products for recorded purchase rates...');

  const products = await prisma.product.findMany({
    where: { isActive: true },
  });

  let updatedCount = 0;

  for (const product of products) {
    // Find the latest purchase item for this product
    const latestPurchaseItem = await prisma.purchaseItem.findFirst({
      where: { productId: product.id },
      orderBy: { purchase: { purchaseDate: 'desc' } },
      include: { purchase: true },
    });

    if (latestPurchaseItem) {
      const lastRate = latestPurchaseItem.rate;
      await prisma.product.update({
        where: { id: product.id },
        data: { purchasePrice: lastRate },
      });
      console.log(`[backfill] Updated "${product.name}" purchasePrice to Rs. ${lastRate.toString()} (from purchase ref ${latestPurchaseItem.purchase?.referenceNumber || latestPurchaseItem.purchaseId})`);
      updatedCount++;
    } else {
      console.log(`[backfill] No recorded purchases found for "${product.name}" (current purchasePrice: Rs. ${product.purchasePrice.toString()}) - leaving unchanged.`);
    }
  }

  console.log(`[backfill] Backfill completed. ${updatedCount} products updated.`);
}

backfillProductCosts()
  .catch((err) => {
    console.error('[backfill] Error running product cost backfill:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
