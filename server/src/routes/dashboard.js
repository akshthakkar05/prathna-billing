import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();
const Decimal = Prisma.Decimal;

// GET /dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayInvoices, allProducts, recentInvoices, recentPurchases] = await Promise.all([
      // 1. Invoices today
      prisma.invoice.findMany({
        where: {
          invoiceDate: { gte: today },
        },
        select: {
          billAmount: true,
        },
      }),

      // 2. All active products for stock calculations
      prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          hsnCode: true,
          unit: true,
          currentStock: true,
          minStockLevel: true,
          purchasePrice: true,
          sellingPrice: true,
        },
      }),

      // 3. Recent 10 invoices
      prisma.invoice.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { name: true, mobile: true },
          },
        },
      }),

      // 4. Recent 10 purchases
      prisma.purchase.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
            select: { name: true, mobile: true },
          },
        },
      }),
    ]);

    // Today's total sales & count
    let todaySalesAmount = new Decimal(0);
    for (const inv of todayInvoices) {
      todaySalesAmount = todaySalesAmount.plus(new Decimal(inv.billAmount));
    }

    // Current total stock value = sum of (currentStock * purchasePrice)
    let totalStockValue = new Decimal(0);
    const lowStockProducts = [];

    for (const prod of allProducts) {
      const stock = new Decimal(prod.currentStock);
      const buyPrice = new Decimal(prod.purchasePrice);
      const minStock = new Decimal(prod.minStockLevel);

      const val = stock.mul(buyPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      totalStockValue = totalStockValue.plus(val);

      if (stock.lessThanOrEqualTo(minStock)) {
        lowStockProducts.push({
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          unit: prod.unit,
          currentStock: stock.toString(),
          minStockLevel: minStock.toString(),
          purchasePrice: buyPrice.toString(),
        });
      }
    }

    res.json({
      todaySales: {
        totalAmount: todaySalesAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        invoiceCount: todayInvoices.length,
      },
      stockSummary: {
        totalStockValue: totalStockValue.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        totalProductsCount: allProducts.length,
        lowStockCount: lowStockProducts.length,
      },
      lowStockProducts,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customer?.name || 'Walk-in',
        billAmount: inv.billAmount.toString(),
        paymentStatus: inv.paymentStatus,
      })),
      recentPurchases: recentPurchases.map((p) => ({
        id: p.id,
        referenceNumber: p.referenceNumber,
        purchaseDate: p.purchaseDate,
        supplierName: p.supplier?.name || 'Vendor',
        totalAmount: p.totalAmount.toString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary', details: error.message });
  }
});

// Alias /stats -> /summary for backward compatibility
router.get('/stats', (req, res) => {
  res.redirect(307, '/dashboard/summary');
});

export default router;
