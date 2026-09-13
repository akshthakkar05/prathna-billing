import prisma from './db.js';

async function backfillInvoices() {
  try {
    const result = await prisma.invoice.updateMany({
      where: {
        OR: [
          { paymentStatus: 'UNPAID' },
          { paymentMethod: null },
        ],
      },
      data: {
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
      },
    });

    console.log(`Successfully backfilled ${result.count} existing invoice(s) to paymentStatus: PAID, paymentMethod: CASH.`);
  } catch (error) {
    console.error('Error during backfill:', error);
  } finally {
    await prisma.$disconnect();
  }
}

backfillInvoices();
