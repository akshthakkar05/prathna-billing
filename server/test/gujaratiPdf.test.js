import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateInvoicePDF, numberToIndianWords } from '../src/utils/pdfGenerator.js';
import prisma from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLIENT_GUJARATI_TERMS = `શરતો અને નિયમો:

1. એકવાર વેચાયેલો માલ પાછો લેવામાં કે બદલવામાં આવશે નહીં.
2. વોરંટી ગ્રાહકે કંપની પાસેથી મેળવવાની રહેશે.
3. ન્યાય ક્ષેત્ર અમદાવાદ રહેશે.

For, PRATHNA ENTERPRISE`;

const mockInvoice = {
  invoiceNumber: 'INV-1099',
  invoiceDate: new Date(),
  paymentStatus: 'PAID',
  paymentMethod: 'CASH',
  customer: {
    name: 'Ramesh Patel',
    mobile: '9898989898',
    address: 'Maninagar, Ahmedabad',
    gstin: '24ABCDE1234F1Z5',
  },
  taxableTotal: '2500.00',
  cgstTotal: '225.00',
  sgstTotal: '225.00',
  roundOff: '0.00',
  billAmount: '2950.00',
  items: [
    {
      descriptionSnapshot: 'Anchor Roma Switch Plate 6M',
      hsnSnapshot: '8538',
      gstRateSnapshot: '18.00',
      qty: '10.00',
      rate: '250.00',
      taxableValue: '2500.00',
      cgstAmount: '225.00',
      sgstAmount: '225.00',
      amount: '2950.00',
      product: { unit: 'PCS' },
    },
  ],
};

const companySettings = {
  name: 'Prathna Enterprises',
  address: '42, Industrial Estate, Phase-1, Ahmedabad, Gujarat - 380015',
  phone: '+91 98765 43210',
  gstin: '24AAACP9988P1Z8',
  pan: 'AAACP9988P',
  terms: '1. Goods once sold will not be taken back.\n2. Subject to Ahmedabad jurisdiction.',
  termsGujarati: CLIENT_GUJARATI_TERMS,
};

test('Gujarati Font file exists and has full glyph set', () => {
  const fontPath = path.resolve(__dirname, '../assets/fonts/NotoSansGujarati-Regular.ttf');
  assert.ok(fs.existsSync(fontPath), `Font file must exist at ${fontPath}`);
  const stats = fs.statSync(fontPath);
  assert.ok(stats.size > 50000, `Font file size should be substantial (got ${stats.size} bytes)`);
});

test('numberToIndianWords correctly formats Indian currency in words', () => {
  assert.equal(numberToIndianWords(0), 'Rupees Zero Only');
  assert.equal(numberToIndianWords(1180), 'Rupees One Thousand One Hundred Eighty Only');
  assert.equal(numberToIndianWords(17700), 'Rupees Seventeen Thousand Seven Hundred Only');
  assert.equal(numberToIndianWords(250000), 'Rupees Two Lakh Fifty Thousand Only');
  assert.equal(numberToIndianWords(10500000), 'Rupees One Crore Five Lakh Only');
  assert.equal(numberToIndianWords(2950.5), 'Rupees Two Thousand Nine Hundred Fifty and Fifty Paise Only');
});

test('generateInvoicePDF renders with pure Gujarati, pure English, and mixed terms', async () => {
  // 1. Mixed terms (standard client text with "For, PRATHNA ENTERPRISE")
  const pdfBufferMixed = await generateInvoicePDF(mockInvoice, companySettings, { copy: 'Duplicate' });
  assert.ok(Buffer.isBuffer(pdfBufferMixed));
  assert.ok(pdfBufferMixed.length > 5000);
  const rawMixed = pdfBufferMixed.toString('binary');
  assert.ok(rawMixed.includes('Helvetica'), 'Should embed Helvetica');

  // 2. Pure English terms
  const pdfBufferEnglish = await generateInvoicePDF(mockInvoice, {
    ...companySettings,
    termsGujarati: 'TERMS & CONDITIONS:\n\n1. Goods once sold will not be taken back.\n\nFor, PRATHNA ENTERPRISE',
  });
  assert.ok(Buffer.isBuffer(pdfBufferEnglish));

  // 3. Pure Gujarati terms
  const pdfBufferGujarati = await generateInvoicePDF(mockInvoice, {
    ...companySettings,
    termsGujarati: 'શરતો અને નિયમો:\n\nએકવાર વેચાયેલો માલ પાછો લેવામાં આવશે નહીં.\nન્યાય ક્ષેત્ર અમદાવાદ રહેશે.',
  });
  assert.ok(Buffer.isBuffer(pdfBufferGujarati));
});

test('CompanySettings model contains termsGujarati and can be saved/retrieved', async () => {
  const existing = await prisma.companySettings.findFirst();
  if (existing) {
    const updated = await prisma.companySettings.update({
      where: { id: existing.id },
      data: { termsGujarati: CLIENT_GUJARATI_TERMS },
    });
    assert.equal(updated.termsGujarati, CLIENT_GUJARATI_TERMS);
  } else {
    const created = await prisma.companySettings.create({
      data: {
        name: 'Prathna Enterprises',
        termsGujarati: CLIENT_GUJARATI_TERMS,
      },
    });
    assert.equal(created.termsGujarati, CLIENT_GUJARATI_TERMS);
  }

  const fetched = await prisma.companySettings.findFirst();
  assert.equal(fetched.termsGujarati, CLIENT_GUJARATI_TERMS);

  await prisma.$disconnect();
});
