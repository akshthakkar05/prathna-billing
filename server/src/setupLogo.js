import prisma from './db.js';

async function main() {
  console.log('Setting up company logo...');
  const settings = await prisma.companySettings.findFirst();
  if (settings) {
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: {
        name: 'Prathna Enterprises',
        logoUrl: '/assets/logo/prathna-logo.png',
      },
    });
    console.log('Updated existing CompanySettings with logoUrl: /assets/logo/prathna-logo.png');
  } else {
    await prisma.companySettings.create({
      data: {
        name: 'Prathna Enterprises',
        logoUrl: '/assets/logo/prathna-logo.png',
      },
    });
    console.log('Created CompanySettings with logoUrl: /assets/logo/prathna-logo.png');
  }
}

main()
  .catch((err) => {
    console.error('Error in setupLogo:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
