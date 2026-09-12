import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

// GET all stock transactions
router.get('/', async (req, res) => {
  try {
    const { productId, type } = req.query;

    const where = {};
    if (productId) where.productId = productId;
    if (type) where.type = type;

    const transactions = await prisma.stockTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        product: true,
      },
    });

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching stock transactions:', error);
    res.status(500).json({ error: 'Failed to fetch stock transactions', details: error.message });
  }
});

// POST adjust stock / restock
router.post('/adjust', async (req, res) => {
  try {
    const { productId, quantity, type = 'ADJUSTMENT', reference = 'Manual adjustment' } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({ error: 'Product ID and quantity are required' });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty === 0) {
      return res.status(400).json({ error: 'Quantity must be a non-zero number' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: {
          currentStock: {
            increment: qty,
          },
        },
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          productId,
          type,
          quantity: qty,
          reference,
        },
        include: {
          product: true,
        },
      });

      return { product: updatedProduct, transaction };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ error: error.message || 'Failed to adjust stock' });
  }
});

export default router;
