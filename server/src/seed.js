import bcrypt from 'bcryptjs';
import prisma from './db.js';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️ Seeding skipped in production environment. Do not populate demo data in production.');
    return;
  }

  console.log('🌱 Seeding development database...');

  // 1. Create default user with bcrypt hashed password for initial local development setup
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@prathna.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'password123';
  const hashedPassword = await bcrypt.hash(adminPass, 10);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
    },
    create: {
      name: 'Initial Admin',
      email: adminEmail,
      password: hashedPassword,
    },
  });
  console.log('✅ Initial dev admin credential ready:', user.email);

  // 2. Create sample Customers
  const customersData = [
    {
      name: 'Sharma Electricals & Hardware',
      mobile: '+91 98765 43210',
      address: 'Shop 14, Main Market, Ahmedabad, Gujarat',
      gstin: '24AAAAA0000A1Z5',
    },
    {
      name: 'Patel Trading Co.',
      mobile: '+91 98234 56789',
      address: 'GIDC Industrial Estate, Vadodara, Gujarat',
      gstin: '24BBBBB1111B1Z2',
    },
    {
      name: 'Om Sai Enterprises',
      mobile: '+91 91234 56780',
      address: 'Station Road, Surat, Gujarat',
      gstin: '24CCCCC2222C1Z9',
    },
    {
      name: 'Rajesh Kumar (Retail)',
      mobile: '+91 99887 76655',
      address: 'Satellite, Ahmedabad, Gujarat',
      gstin: null,
    },
  ];

  const customers = [];
  for (const c of customersData) {
    let customer = await prisma.customer.findFirst({
      where: { name: c.name },
    });
    if (!customer) {
      customer = await prisma.customer.create({ data: c });
    }
    customers.push(customer);
  }
  console.log(`✅ ${customers.length} Customers ready.`);

  // 3. Create client's real Products
  const productsData = [
    {
      name: 'Absolute Magic Locker – Android',
      hsnCode: '998314',
      gstRate: 18.0,
      purchasePrice: 0.0,
      sellingPrice: 200.0,
      currentStock: 0.0,
      minStockLevel: 0.0,
      unit: 'PCS',
    },
    {
      name: 'Absolute Magic Locker – Apple',
      hsnCode: '998314',
      gstRate: 18.0,
      purchasePrice: 0.0,
      sellingPrice: 400.0,
      currentStock: 0.0,
      minStockLevel: 0.0,
      unit: 'PCS',
    },
  ];

  const products = [];
  for (const p of productsData) {
    let product = await prisma.product.findFirst({
      where: { name: p.name },
    });
    if (!product) {
      product = await prisma.product.create({
        data: p,
      });

      // Record opening stock transaction
      await prisma.stockTransaction.create({
        data: {
          productId: product.id,
          type: 'PURCHASE',
          quantity: p.currentStock,
          reference: 'Initial Stock Inward',
        },
      });
    }
    products.push(product);
  }
  console.log(`✅ ${products.length} Products ready.`);

  console.log('✨ Database seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
