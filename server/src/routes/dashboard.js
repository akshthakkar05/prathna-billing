import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      allInvoices,
      todayInvoices,
      allProducts,
      totalCustomers,
      recentInvoices,
    ] = await Promise.all([
      prisma.invoice.findMany({
        select: {
          billAmount: true,
          paymentStatus: true,
          createdAt: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          createdAt: { gte: today },
        },
        select: {
          billAmount: true,
        },
      }),
      prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          currentStock: true,
          minStockLevel: true,
          unit: true,
        },
      }),
      prisma.customer.count(),
      prisma.invoice.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
          items: true,
        },
      }),
    ]);

    // Compute totals
    const totalSales = allInvoices.reduce((sum, inv) => sum + Number(inv.billAmount), 0);
    const todaySales = todayInvoices.reduce((sum, inv) => sum + Number(inv.billAmount), 0);
    const unpaidInvoices = allInvoices.filter(i => i.paymentStatus === 'UNPAID');
    const unpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.billAmount), 0);

    // Low stock products
    const lowStockProducts = allProducts.filter(
      p => Number(p.currentStock) <= Number(p.minStockLevel)
    );

    // Sales by status
    const statusCounts = {
      PAID: allInvoices.filter(i => i.paymentStatus === 'PAID').length,
      UNPAID: unpaidInvoices.length,
      PARTIAL: allInvoices.filter(i => i.paymentStatus === 'PARTIAL').length,
    };

    res.json({
      totalSales: Number(totalSales.toFixed(2)),
      todaySales: Number(todaySales.toFixed(2)),
      totalInvoices: allInvoices.length,
      unpaidCount: unpaidInvoices.length,
      unpaidAmount: Number(unpaidAmount.toFixed(2)),
      totalProducts: allProducts.length,
      lowStockCount: lowStockProducts.length,
      lowStockProducts: lowStockProducts.slice(0, 5),
      totalCustomers,
      recentInvoices,
      statusCounts,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
});

export default router;
