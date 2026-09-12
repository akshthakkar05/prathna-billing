import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();
const Decimal = Prisma.Decimal;

// GET /products - list products for frontend selection
router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products', details: error.message });
  }
});

// POST /products - Create Product
router.post('/', async (req, res) => {
  try {
    const {
      name,
      sku,
      hsnCode,
      gstRate,
      purchasePrice,
      sellingPrice,
      openingStock = 0,
      unit = 'PCS',
      minStockLevel = 0,
    } = req.body;

    if (!name || !hsnCode || gstRate === undefined || purchasePrice === undefined || sellingPrice === undefined) {
      return res.status(400).json({
        error: 'Missing required product fields: name, hsnCode, gstRate, purchasePrice, sellingPrice are mandatory',
      });
    }

    const dGstRate = new Decimal(gstRate);
    const dPurchasePrice = new Decimal(purchasePrice);
    const dSellingPrice = new Decimal(sellingPrice);
    const dOpeningStock = new Decimal(openingStock || 0);
    const dMinStockLevel = new Decimal(minStockLevel || 0);

    const product = await prisma.$transaction(async (tx) => {
      // 1. Create product row
      const newProduct = await tx.product.create({
        data: {
          name: name.trim(),
          sku: sku ? sku.trim() : null,
          hsnCode: String(hsnCode).trim(),
          gstRate: dGstRate,
          purchasePrice: dPurchasePrice,
          sellingPrice: dSellingPrice,
          currentStock: dOpeningStock,
          minStockLevel: dMinStockLevel,
          unit: unit || 'PCS',
          isActive: true,
        },
      });

      // 2. If opening stock > 0, log stock transaction
      if (dOpeningStock.greaterThan(0)) {
        await tx.stockTransaction.create({
          data: {
            productId: newProduct.id,
            type: 'PURCHASE',
            quantity: dOpeningStock,
            reference: 'Opening Stock',
          },
        });
      }

      return newProduct;
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product', details: error.message });
  }
});

export default router;
