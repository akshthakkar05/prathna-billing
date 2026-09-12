import prisma from './db.js';

async function main() {
  console.log('🌱 Seeding Prathna Billing database...');

  // 1. Create default user
  const user = await prisma.user.upsert({
    where: { email: 'admin@prathna.com' },
    update: {},
    create: {
      name: 'Prathna Admin',
      email: 'admin@prathna.com',
      password: 'password123',
    },
  });
  console.log('✅ User seeded:', user.email);

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

  // 3. Create sample Products
  const productsData = [
    {
      name: 'LED Panel Light 15W Round',
      sku: 'LED-PL-15W',
      hsnCode: '9405',
      gstRate: 18.0,
      purchasePrice: 220.0,
      sellingPrice: 350.0,
      currentStock: 45.0,
      minStockLevel: 10.0,
      unit: 'PCS',
    },
    {
      name: 'Copper Wire 1.5 sq mm (90m coil)',
      sku: 'WIR-CU-15',
      hsnCode: '8544',
      gstRate: 18.0,
      purchasePrice: 1250.0,
      sellingPrice: 1650.0,
      currentStock: 25.0,
      minStockLevel: 5.0,
      unit: 'ROLL',
    },
    {
      name: 'Modular Switch 6A 1-Way',
      sku: 'SW-MOD-6A',
      hsnCode: '8536',
      gstRate: 18.0,
      purchasePrice: 22.0,
      sellingPrice: 42.0,
      currentStock: 150.0,
      minStockLevel: 20.0,
      unit: 'PCS',
    },
    {
      name: 'Ceiling Fan 1200mm High Speed',
      sku: 'FAN-CF-1200',
      hsnCode: '8414',
      gstRate: 18.0,
      purchasePrice: 1400.0,
      sellingPrice: 1950.0,
      currentStock: 8.0,
      minStockLevel: 10.0, // Low stock on purpose
      unit: 'PCS',
    },
    {
      name: 'PVC Conduit Pipe 20mm (3m)',
      sku: 'CON-PVC-20',
      hsnCode: '3917',
      gstRate: 18.0,
      purchasePrice: 45.0,
      sellingPrice: 75.0,
      currentStock: 4.0, // Low stock on purpose
      minStockLevel: 15.0,
      unit: 'LENGTH',
    },
    {
      name: 'Industrial Miniature Circuit Breaker (MCB) 32A',
      sku: 'MCB-DP-32A',
      hsnCode: '8536',
      gstRate: 18.0,
      purchasePrice: 310.0,
      sellingPrice: 480.0,
      currentStock: 30.0,
      minStockLevel: 8.0,
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

  // 4. Create sample Invoices if none exist
  const existingInvoices = await prisma.invoice.count();
  if (existingInvoices === 0 && customers.length > 0 && products.length >= 2) {
    const cust1 = customers[0];
    const p1 = products[0]; // LED Light
    const p2 = products[1]; // Wire

    // Invoice 1: INV-1001 (PAID)
    const qty1 = 4;
    const rate1 = Number(p1.sellingPrice);
    const tax1 = qty1 * rate1;
    const cgst1 = (tax1 * 0.09);
    const sgst1 = (tax1 * 0.09);
    const amt1 = tax1 + cgst1 + sgst1;

    const qty2 = 2;
    const rate2 = Number(p2.sellingPrice);
    const tax2 = qty2 * rate2;
    const cgst2 = (tax2 * 0.09);
    const sgst2 = (tax2 * 0.09);
    const amt2 = tax2 + cgst2 + sgst2;

    const totalTaxable = tax1 + tax2;
    const totalCgst = cgst1 + cgst2;
    const totalSgst = sgst1 + sgst2;
    const totalBill = Math.round(totalTaxable + totalCgst + totalSgst);
    const roundOff = totalBill - (totalTaxable + totalCgst + totalSgst);

    await prisma.invoice.create({
      data: {
        invoiceNumber: 'INV-1001',
        invoiceDate: new Date(),
        customerId: cust1.id,
        taxableTotal: totalTaxable,
        cgstTotal: totalCgst,
        sgstTotal: totalSgst,
        roundOff,
        billAmount: totalBill,
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
        items: {
          create: [
            {
              productId: p1.id,
              descriptionSnapshot: p1.name,
              hsnSnapshot: p1.hsnCode,
              gstRateSnapshot: p1.gstRate,
              qty: qty1,
              rate: rate1,
              taxableValue: tax1,
              cgstAmount: cgst1,
              sgstAmount: sgst1,
              amount: amt1,
            },
            {
              productId: p2.id,
              descriptionSnapshot: p2.name,
              hsnSnapshot: p2.hsnCode,
              gstRateSnapshot: p2.gstRate,
              qty: qty2,
              rate: rate2,
              taxableValue: tax2,
              cgstAmount: cgst2,
              sgstAmount: sgst2,
              amount: amt2,
            },
          ],
        },
      },
    });

    console.log('✅ Sample Invoice INV-1001 created.');
  }

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
