import prisma from './db.js';
import bcrypt from 'bcryptjs';

async function setupRealProducts() {
  console.log('[setup] Clearing test data and resetting database to clean production state...');

  // 1. Delete dependent test records
  await prisma.salesReturnItem.deleteMany({});
  await prisma.salesReturn.deleteMany({});
  console.log('[setup] Removed sales returns');

  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  console.log('[setup] Removed invoices');

  await prisma.purchaseItem.deleteMany({});
  await prisma.purchase.deleteMany({});
  console.log('[setup] Removed purchases');

  await prisma.stockTransaction.deleteMany({});
  console.log('[setup] Removed stock transactions');

  // 2. Remove test suppliers
  await prisma.supplier.deleteMany({});
  console.log('[setup] Removed test suppliers');

  // 3. Remove all old demo/placeholder/test products
  await prisma.product.deleteMany({});
  console.log('[setup] Removed placeholder/test products');

  // 4. Clean test customers
  await prisma.customer.deleteMany({});
  console.log('[setup] Cleaned test customers');

  // 5. Remove test users created during test runs (keep only admin)
  await prisma.user.deleteMany({
    where: {
      email: { not: 'admin@prathna.com' },
    },
  });
  console.log('[setup] Removed test users');

  // 6. Reset Invoice Counter
  await prisma.invoiceCounter.upsert({
    where: { name: 'invoice' },
    update: { current: 1000 },
    create: { name: 'invoice', current: 1000 },
  });
  console.log('[setup] Reset invoice counter (next invoice will be INV-1001)');

  // 7. Ensure Admin User exists with secure hashed password
  const hashedPassword = await bcrypt.hash('Password@123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@prathna.com' },
    update: {
      name: 'Prathna Admin',
      password: hashedPassword,
      mustChangePassword: false,
    },
    create: {
      name: 'Prathna Admin',
      email: 'admin@prathna.com',
      password: hashedPassword,
      mustChangePassword: false,
    },
  });
  console.log('[setup] Primary admin user ready (admin@prathna.com)');

  // 8. Create Walk-in Counter Customer
  await prisma.customer.create({
    data: {
      name: 'Walk-in (Cash)',
      address: 'Ahmedabad, Gujarat',
      state: '24',
    },
  });
  console.log('[setup] Created default Walk-in (Cash) customer');

  // 9. Add Real Client Products
  const realProducts = [
    {
      name: 'Absolute Magic Locker – Android',
      hsnCode: '998314',
      gstRate: 18.0,
      unit: 'PCS',
      sellingPrice: 200.0,
      purchasePrice: 0.0,
      currentStock: 80.0,
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
    console.log(`[setup] Created real product: ${created.name} (HSN/SAC: ${created.hsnCode}, GST: ${created.gstRate}%, Rate: Rs. ${created.sellingPrice}, Stock: ${created.currentStock})`);
  }

  // 10. Ensure CompanySettings has clean details
  const company = await prisma.companySettings.findFirst();
  if (company) {
    await prisma.companySettings.update({
      where: { id: company.id },
      data: {
        name: 'Prathna Enterprises',
        gstin: '24AAACP9988P1Z8',
        phone: '+91 98765 43210',
        address: 'Ahmedabad, Gujarat, India',
        logoUrl: '/assets/logo/prathna-logo.png',
        terms: '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged if bill is not paid on presentation.\n3. Subject to Ahmedabad jurisdiction.',
        termsGujarati: '૧. વેચેલો માલ પાછો લેવામાં આવશે નહીં.\n૨. બિલની રકમ સમયસર ન ચૂકવાય તો વાર્ષિક ૧૮% વ્યાજ લેવામાં આવશે.\n૩. તમામ વિવાદો અમદાવાદ ન્યાયાલયને આધીન રહેશે.',
      },
    });
  } else {
    await prisma.companySettings.create({
      data: {
        name: 'Prathna Enterprises',
        gstin: '24AAACP9988P1Z8',
        phone: '+91 98765 43210',
        address: 'Ahmedabad, Gujarat, India',
        logoUrl: '/assets/logo/prathna-logo.png',
        terms: '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged if bill is not paid on presentation.\n3. Subject to Ahmedabad jurisdiction.',
        termsGujarati: '૧. વેચેલો માલ પાછો લેવામાં આવશે નહીં.\n૨. બિલની રકમ સમયસર ન ચૂકવાય તો વાર્ષિક ૧૮% વ્યાજ લેવામાં આવશે.\n૩. તમામ વિવાદો અમદાવાદ ન્યાયાલયને આધીન રહેશે.',
      },
    });
  }
  console.log('[setup] Company Settings configured (Prathna Enterprises with Gujarati Terms & Logo)');

  console.log('\n[setup] Database is clean and ready for real counter billing.');
}

setupRealProducts()
  .catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
