import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

// GET /customers - list customers for frontend selection
router.get('/', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers', details: error.message });
  }
});

// POST /customers - Create Customer (name, mobile, address, GSTIN optional)
router.post('/', async (req, res) => {
  try {
    const { name, mobile, address, gstin } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        mobile: mobile ? mobile.trim() : null,
        address: address ? address.trim() : null,
        gstin: gstin ? gstin.trim().toUpperCase() : null,
      },
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer', details: error.message });
  }
});

export default router;
