import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();
const Decimal = Prisma.Decimal;

// GET /reports/sales?from=&to=
router.get('/sales', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = {};

    if (from || to) {
      where.invoiceDate = {};
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        where.invoiceDate.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.invoiceDate.lte = toDate;
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { invoiceDate: 'desc' },
      include: {
        customer: { select: { name: true, mobile: true, gstin: true } },
        items: true,
      },
    });

    let totalTaxable = new Decimal(0);
    let totalCGST = new Decimal(0);
    let totalSGST = new Decimal(0);
    let totalIGST = new Decimal(0);
    let totalSales = new Decimal(0);

    for (const inv of invoices) {
      totalTaxable = totalTaxable.plus(new Decimal(inv.taxableTotal));
      totalCGST = totalCGST.plus(new Decimal(inv.cgstTotal));
      totalSGST = totalSGST.plus(new Decimal(inv.sgstTotal));
      totalIGST = totalIGST.plus(new Decimal(inv.igstTotal || 0));
      totalSales = totalSales.plus(new Decimal(inv.billAmount));
    }

    res.json({
      summary: {
        invoiceCount: invoices.length,
        totalTaxable: totalTaxable.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        taxableTotal: totalTaxable.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        totalCGST: totalCGST.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        cgstTotal: totalCGST.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        totalSGST: totalSGST.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        sgstTotal: totalSGST.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        totalIGST: totalIGST.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        igstTotal: totalIGST.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        totalSales: totalSales.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
      },
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customer?.name || 'Walk-in Customer',
        customerMobile: inv.customer?.mobile,
        itemCount: inv.items.length,
        taxType: inv.taxType || 'INTRASTATE',
        taxableTotal: inv.taxableTotal.toString(),
        cgstTotal: inv.cgstTotal.toString(),
        sgstTotal: inv.sgstTotal.toString(),
        igstTotal: (inv.igstTotal || 0).toString(),
        billAmount: inv.billAmount.toString(),
        paymentStatus: inv.paymentStatus,
      })),
    });
  } catch (error) {
    console.error('Error in sales report:', error);
    res.status(500).json({ error: 'Failed to generate sales report', details: error.message });
  }
});

// GET /reports/purchases?from=&to=
router.get('/purchases', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = {};

    if (from || to) {
      where.purchaseDate = {};
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        where.purchaseDate.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.purchaseDate.lte = toDate;
      }
    }

    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: { purchaseDate: 'desc' },
      include: {
        supplier: { select: { name: true, mobile: true, gstin: true } },
        items: true,
      },
    });

    let totalPurchases = new Decimal(0);

    for (const p of purchases) {
      totalPurchases = totalPurchases.plus(new Decimal(p.totalAmount));
    }

    res.json({
      summary: {
        purchaseCount: purchases.length,
        totalPurchases: totalPurchases.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
      },
      purchases: purchases.map((p) => ({
        id: p.id,
        referenceNumber: p.referenceNumber,
        purchaseDate: p.purchaseDate,
        supplierName: p.supplier?.name || 'Vendor',
        itemCount: p.items.length,
        totalAmount: p.totalAmount.toString(),
      })),
    });
  } catch (error) {
    console.error('Error in purchases report:', error);
    res.status(500).json({ error: 'Failed to generate purchases report', details: error.message });
  }
});

// GET /reports/stock
router.get('/stock', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    let totalStockValue = new Decimal(0);
    let lowStockCount = 0;

    const stockItems = products.map((p) => {
      const stock = new Decimal(p.currentStock);
      const buyPrice = new Decimal(p.purchasePrice);
      const sellPrice = new Decimal(p.sellingPrice);
      const minStock = new Decimal(p.minStockLevel);

      const itemStockValue = stock.mul(buyPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      totalStockValue = totalStockValue.plus(itemStockValue);

      const isLowStock = stock.lessThanOrEqualTo(minStock);
      if (isLowStock) lowStockCount++;

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        hsnCode: p.hsnCode,
        unit: p.unit,
        currentStock: stock.toString(),
        minStockLevel: minStock.toString(),
        purchasePrice: buyPrice.toString(),
        sellingPrice: sellPrice.toString(),
        stockValue: itemStockValue.toString(),
        isLowStock,
      };
    });

    res.json({
      summary: {
        totalProducts: products.length,
        lowStockCount,
        totalStockValue: totalStockValue.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
      },
      items: stockItems,
    });
  } catch (error) {
    console.error('Error in stock report:', error);
    res.status(500).json({ error: 'Failed to generate stock report', details: error.message });
  }
});

export default router;
