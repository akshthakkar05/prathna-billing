import bcrypt from 'bcryptjs';
import prisma from './db.js';

async function main() {
  console.log('[seed] Seeding fresh database for Prathna Enterprise...');

  // 1. Create clean admin account
  const adminEmail = process.env.ADMIN_EMAIL || 'prijs24@gmail.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'Prathna@10';
  const hashedPassword = await bcrypt.hash(adminPass, 10);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      name: 'Prathna Admin',
      mustChangePassword: false,
    },
    create: {
      name: 'Prathna Admin',
      email: adminEmail,
      password: hashedPassword,
      mustChangePassword: false,
    },
  });
  console.log('[seed] Admin credential ready:', user.email);

  // 2. Initialize Company Settings
  const defaultSettings = {
    name: 'Prathna Enterprise',
    address: 'C-7, Lalbhai Centre, Opp. Edan Park Society, Mani Nagar East, Ahmedabad, Gujarat - 380008',
    phone: '+91 99099 48775',
    gstin: '24AKBPC4941M1ZA',
    pan: 'AKBPC4941M',
    logoUrl: '/assets/logo/prathna-logo.png',
    terms: '1. Goods once sold will not be taken back or exchanged.\n2. Subject to Ahmedabad Jurisdiction.\n3. Warranty for the goods received by me is responsibility of the manufacturer and PE is not reliable for the same.',
    termsGujarati: '૧. વેચેલો માલ પાછો લેવામાં આવશે નહીં.\n૨. બિલની રકમ સમયસર ન ચૂકવાય તો વાર્ષિક ૧૮% વ્યાજ લેવામાં આવશે.\n૩. તમામ વિવાદો અમદાવાદ ન્યાયાલયને આધીન રહેશે.',
  };

  const existingSettings = await prisma.companySettings.findFirst();
  if (existingSettings) {
    await prisma.companySettings.update({
      where: { id: existingSettings.id },
      data: defaultSettings,
    });
  } else {
    await prisma.companySettings.create({
      data: defaultSettings,
    });
  }
  console.log('[seed] Company profile settings initialized for Prathna Enterprise.');

  console.log('[seed] Fresh database ready (0 products, 0 customers, 0 suppliers, 0 invoices).');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
