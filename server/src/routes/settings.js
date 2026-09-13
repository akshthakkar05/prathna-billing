import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../db.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoDir = path.resolve(__dirname, '../../assets/logo');

// Ensure logo directory exists
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, { recursive: true });
}

// Default initial settings
const DEFAULT_SETTINGS = {
  name: 'Your Company Name',
  address: '',
  phone: '',
  gstin: '',
  pan: '',
  logoUrl: null,
  terms: '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.',
  termsGujarati: 'શરતો અને નિયમો:\n\n૧. એકવાર વેચેલો માલ પાછો લેવામાં આવશે નહીં.\n૨. વોરંટી કંપનીના નિયમો મુજબ રહેશે.\n૩. ન્યાય ક્ષેત્ર સ્થાનિક રહેશે.',
};

// GET /settings - get current company settings
router.get('/', async (req, res) => {
  try {
    let settings = await prisma.companySettings.findFirst();
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: DEFAULT_SETTINGS,
      });
    } else if (!settings.termsGujarati) {
      settings = await prisma.companySettings.update({
        where: { id: settings.id },
        data: { termsGujarati: DEFAULT_SETTINGS.termsGujarati },
      });
    }
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
  }
});

// POST /settings - update company settings
router.post('/', async (req, res) => {
  try {
    const { name, address, phone, gstin, pan, terms, termsGujarati, logoUrl } = req.body;

    const existing = await prisma.companySettings.findFirst();

    let settings;
    if (existing) {
      const updateData = {
        name: name ? name.trim() : existing.name,
        address: address !== undefined ? address.trim() : existing.address,
        phone: phone !== undefined ? phone.trim() : existing.phone,
        gstin: gstin !== undefined ? gstin.trim().toUpperCase() : existing.gstin,
        pan: pan !== undefined ? pan.trim().toUpperCase() : existing.pan,
        terms: terms !== undefined ? terms.trim() : existing.terms,
        termsGujarati: termsGujarati !== undefined ? termsGujarati.trim() : (existing.termsGujarati || DEFAULT_SETTINGS.termsGujarati),
      };
      if (logoUrl !== undefined) {
        updateData.logoUrl = logoUrl ? logoUrl.trim() : null;
      }

      settings = await prisma.companySettings.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      settings = await prisma.companySettings.create({
        data: {
          name: name ? name.trim() : DEFAULT_SETTINGS.name,
          address: address ? address.trim() : DEFAULT_SETTINGS.address,
          phone: phone ? phone.trim() : DEFAULT_SETTINGS.phone,
          gstin: gstin ? gstin.trim().toUpperCase() : DEFAULT_SETTINGS.gstin,
          pan: pan ? pan.trim().toUpperCase() : DEFAULT_SETTINGS.pan,
          logoUrl: logoUrl ? logoUrl.trim() : null,
          terms: terms ? terms.trim() : DEFAULT_SETTINGS.terms,
          termsGujarati: termsGujarati ? termsGujarati.trim() : DEFAULT_SETTINGS.termsGujarati,
        },
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
});

// POST /settings/logo - upload and store new company logo
router.post('/logo', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    // Support data URL scheme e.g. data:image/png;base64,... or raw base64
    let base64Data = image;
    let ext = 'png';

    const matches = image.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (matches) {
      ext = matches[1].toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      base64Data = matches[2];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    const filename = `company-logo.${ext}`;
    const filePath = path.join(logoDir, filename);

    await fs.promises.writeFile(filePath, buffer);

    // Cache-busting timestamp parameter so browser immediately displays the freshly uploaded logo
    const v = Date.now();
    const logoUrl = `/assets/logo/${filename}?v=${v}`;

    let existing = await prisma.companySettings.findFirst();
    if (existing) {
      existing = await prisma.companySettings.update({
        where: { id: existing.id },
        data: { logoUrl },
      });
    } else {
      existing = await prisma.companySettings.create({
        data: {
          ...DEFAULT_SETTINGS,
          logoUrl,
        },
      });
    }

    res.json({
      success: true,
      logoUrl,
      settings: existing,
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo', details: error.message });
  }
});

// DELETE /settings/logo - remove company logo and revert to text fallback
router.delete('/logo', async (req, res) => {
  try {
    const existing = await prisma.companySettings.findFirst();
    let updated = null;
    if (existing) {
      updated = await prisma.companySettings.update({
        where: { id: existing.id },
        data: { logoUrl: null },
      });
    }

    res.json({
      success: true,
      logoUrl: null,
      settings: updated,
    });
  } catch (error) {
    console.error('Error removing logo:', error);
    res.status(500).json({ error: 'Failed to remove logo', details: error.message });
  }
});

export default router;
