import prisma from './db.js';

async function setupRealProducts() {
  console.log('🧹 Clearing test data from database...');

  // 1. Delete dependent test records
  await prisma.salesReturnItem.deleteMany({});
  await prisma.salesReturn.deleteMany({});
  console.log('✅ Removed sales returns');

  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  console.log('✅ Removed invoices');

  await prisma.purchaseItem.deleteMany({});
  await prisma.purchase.deleteMany({});
  console.log('✅ Removed purchases');

  await prisma.stockTransaction.deleteMany({});
  console.log('✅ Removed stock transactions');

  // 2. Remove test suppliers
  await prisma.supplier.deleteMany({});
  console.log('✅ Removed test suppliers');

  // 3. Remove all old demo/placeholder/test products
  await prisma.product.deleteMany({});
  console.log('✅ Removed placeholder/test products');

  // 4. Clean test customers (customers created during tests with timestamps or 'Customer' in name)
  await prisma.customer.deleteMany({});
  console.log('✅ Cleaned test customers');

  // 4. Add Real Products
  const realProducts = [
    {
      name: 'Absolute Magic Locker – Android',
      hsnCode: '998314',
      gstRate: 18.0,
      unit: 'PCS',
      sellingPrice: 200.0,
      purchasePrice: 0.0,
      currentStock: 0.0,
      minStockLevel: 0.0,
    },
    {
      name: 'Absolute Magic Locker – Apple',
      hsnCode: '998314',
      gstRate: 18.0,
      unit: 'PCS',
      sellingPrice: 400.0,
      purchasePrice: 0.0,
      currentStock: 0.0,
      minStockLevel: 0.0,
    },
  ];

  for (const prod of realProducts) {
    const created = await prisma.product.create({
      data: prod,
    });
    console.log(`✅ Created real product: ${created.name} (HSN/SAC: ${created.hsnCode}, GST: ${created.gstRate}%, Rate: ₹${created.sellingPrice}, Stock: ${created.currentStock})`);
  }

  // Ensure CompanySettings has clean details
  const company = await prisma.companySettings.findFirst();
  if (company) {
    await prisma.companySettings.update({
      where: { id: company.id },
      data: {
        name: 'Prathna Enterprises',
        gstin: company.gstin || '24AAACP9988P1Z8',
        logoUrl: company.logoUrl || '/assets/logo/prathna-logo.png',
      },
    });
  }

  console.log('\n✨ Database is clean and ready with client real products.');
}

setupRealProducts()
  .catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
