import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

// Default initial settings
const DEFAULT_SETTINGS = {
  name: 'Prathna Enterprises',
  address: '42, Industrial Estate, Phase-1, Ahmedabad, Gujarat - 380015',
  phone: '+91 98765 43210',
  gstin: '24AAACP9988P1Z8',
  pan: 'AAACP9988P',
  terms: '1. Goods once sold will not be taken back.\n2. Subject to Ahmedabad jurisdiction.',
};

// GET /settings - get current company settings
router.get('/', async (req, res) => {
  try {
    let settings = await prisma.companySettings.findFirst();
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: DEFAULT_SETTINGS,
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
    const { name, address, phone, gstin, pan, terms } = req.body;

    const existing = await prisma.companySettings.findFirst();

    let settings;
    if (existing) {
      settings = await prisma.companySettings.update({
        where: { id: existing.id },
        data: {
          name: name ? name.trim() : existing.name,
          address: address !== undefined ? address.trim() : existing.address,
          phone: phone !== undefined ? phone.trim() : existing.phone,
          gstin: gstin !== undefined ? gstin.trim().toUpperCase() : existing.gstin,
          pan: pan !== undefined ? pan.trim().toUpperCase() : existing.pan,
          terms: terms !== undefined ? terms.trim() : existing.terms,
        },
      });
    } else {
      settings = await prisma.companySettings.create({
        data: {
          name: name ? name.trim() : DEFAULT_SETTINGS.name,
          address: address ? address.trim() : DEFAULT_SETTINGS.address,
          phone: phone ? phone.trim() : DEFAULT_SETTINGS.phone,
          gstin: gstin ? gstin.trim().toUpperCase() : DEFAULT_SETTINGS.gstin,
          pan: pan ? pan.trim().toUpperCase() : DEFAULT_SETTINGS.pan,
          terms: terms ? terms.trim() : DEFAULT_SETTINGS.terms,
        },
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings', details: error.message });
  }
});

export default router;
