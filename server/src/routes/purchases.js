import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();
const Decimal = Prisma.Decimal;

// GET /purchases - list all purchases
router.get('/', async (req, res) => {
  try {
    const purchases = await prisma.purchase.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases', details: error.message });
  }
});

// GET /purchases/:id - get single purchase
router.get('/:id', async (req, res) => {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    res.json(purchase);
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Failed to fetch purchase', details: error.message });
  }
});

// POST /purchases - create purchase & increase stock atomically
router.post('/', async (req, res) => {
  try {
    const {
      supplierId,
      referenceNumber,
      purchaseDate,
      notes,
      items, // array of { productId, qty, rate, gstRate? }
    } = req.body;

    if (!supplierId) {
      return res.status(400).json({ error: 'Supplier ID is required' });
    }

    if (!referenceNumber || !referenceNumber.trim()) {
      return res.status(400).json({ error: 'Invoice/reference number is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Purchase must contain at least one item' });
    }

    const refNum = referenceNumber.trim();

    // Single DB transaction for purchase + items + stock_transactions + stock updates
    const savedPurchase = await prisma.$transaction(async (tx) => {
      // 1. Verify supplier
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
      });
      if (!supplier) {
        throw new Error(`Supplier not found with id: ${supplierId}`);
      }

      let totalAmount = new Decimal(0);
      const preparedItems = [];

      for (const item of items) {
        if (!item.productId) {
          throw new Error('Each item must specify a productId');
        }

        const qty = new Decimal(item.qty || 0);
        if (qty.lte(0)) {
          throw new Error('Quantity must be greater than zero');
        }

        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error(`Product not found with id: ${item.productId}`);
        }

        const rate = item.rate !== undefined && item.rate !== null
          ? new Decimal(item.rate)
          : new Decimal(product.purchasePrice);

        const gstRate = item.gstRate !== undefined && item.gstRate !== null
          ? new Decimal(item.gstRate)
          : new Decimal(product.gstRate);

        // Taxable + GST amount for purchase line
        const taxable = qty.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const gstAmount = taxable.mul(gstRate).div(new Decimal(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const lineAmount = taxable.plus(gstAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

        totalAmount = totalAmount.plus(lineAmount);

        preparedItems.push({
          productId: product.id,
          qty,
          rate,
          gstRate,
          amount: lineAmount,
        });

        // Auto-update Product.purchasePrice using weighted average cost
        const currentStockBefore = new Decimal(product.currentStock);
        const currentPurchasePrice = new Decimal(product.purchasePrice);

        let newPurchasePrice;
        if (currentStockBefore.lessThanOrEqualTo(0)) {
          newPurchasePrice = rate.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        } else {
          const totalExistingValue = currentStockBefore.mul(currentPurchasePrice);
          const totalNewValue = qty.mul(rate);
          const totalQty = currentStockBefore.plus(qty);
          newPurchasePrice = totalExistingValue.plus(totalNewValue).div(totalQty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        }

        const newStock = currentStockBefore.plus(qty);

        // Update product stock and weighted purchasePrice (sellingPrice remains untouched)
        await tx.product.update({
          where: { id: product.id },
          data: {
            currentStock: newStock,
            purchasePrice: newPurchasePrice,
          },
        });

        // Write a stock_transaction of type PURCHASE per item
        await tx.stockTransaction.create({
          data: {
            productId: product.id,
            type: 'PURCHASE',
            quantity: qty, // positive for stock in
            reference: refNum,
          },
        });
      }

      // Create Purchase record + items
      const purchase = await tx.purchase.create({
        data: {
          supplierId: supplier.id,
          referenceNumber: refNum,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          totalAmount: totalAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
          notes: notes ? notes.trim() : null,
          items: {
            create: preparedItems,
          },
        },
        include: {
          supplier: true,
          items: {
            include: { product: true },
          },
        },
      });

      return purchase;
    });

    res.status(201).json(savedPurchase);
  } catch (error) {
    console.error('Error creating purchase:', error.message);
    res.status(400).json({ error: error.message || 'Failed to create purchase' });
  }
});

export default router;
