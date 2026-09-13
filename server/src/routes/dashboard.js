import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();
const Decimal = Prisma.Decimal;

/**
 * Helper to compute start and end dates based on selected range
 */
function resolveDateRange(range = 'today', startDate, endDate) {
  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);
  let label = "Today's Sales";

  switch (range.toLowerCase()) {
    case 'yesterday': {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      label = "Yesterday's Sales";
      break;
    }
    case 'this_week': {
      const day = now.getDay();
      // Monday as first day of week: (day === 0 ? 6 : day - 1)
      const diff = now.getDate() - (day === 0 ? 6 : day - 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      label = "This Week's Sales";
      break;
    }
    case 'this_month': {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      label = "This Month's Sales";
      break;
    }
    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      label = "Last Month's Sales";
      break;
    }
    case 'custom': {
      if (startDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
      }
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }
      label = 'Sales for Period';
      break;
    }
    case 'today':
    default: {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      label = "Today's Sales";
      break;
    }
  }

  return { start, end, label, range };
}

// GET /dashboard/summary - Live operational metrics
router.get('/summary', async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    const dateRange = resolveDateRange(range, startDate, endDate);

    // Also calculate pure today bounds for backward compatibility
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [rangeInvoices, todayInvoices, allProducts, recentInvoices] = await Promise.all([
      // 1. Invoices in chosen range
      prisma.invoice.findMany({
        where: {
          invoiceDate: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
        select: {
          billAmount: true,
        },
      }),

      // 2. Invoices strictly today (for backward compat)
      prisma.invoice.findMany({
        where: {
          invoiceDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        select: {
          billAmount: true,
        },
      }),

      // 3. All active catalog products for live stock calculations
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
        orderBy: { name: 'asc' },
      }),

      // 4. Recent 10 invoices
      prisma.invoice.findMany({
        take: 10,
        orderBy: { invoiceDate: 'desc' },
        include: {
          customer: {
            select: { name: true, mobile: true },
          },
        },
      }),
    ]);

    // Period sales amount & count
    let periodSalesAmount = new Decimal(0);
    for (const inv of rangeInvoices) {
      periodSalesAmount = periodSalesAmount.plus(new Decimal(inv.billAmount));
    }

    // Today sales amount & count
    let todaySalesAmount = new Decimal(0);
    for (const inv of todayInvoices) {
      todaySalesAmount = todaySalesAmount.plus(new Decimal(inv.billAmount));
    }

    // Live inventory valuation & individual product status
    let totalStockValue = new Decimal(0);
    const lowStockProducts = [];
    const stockOverview = [];

    for (const prod of allProducts) {
      const stock = new Decimal(prod.currentStock);
      const buyPrice = new Decimal(prod.purchasePrice);
      const sellPrice = new Decimal(prod.sellingPrice);
      const minStock = new Decimal(prod.minStockLevel || 0);
      const val = stock.mul(buyPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      totalStockValue = totalStockValue.plus(val);

      const isLow = stock.lessThanOrEqualTo(minStock);
      const itemData = {
        id: prod.id,
        name: prod.name,
        sku: prod.sku,
        unit: prod.unit,
        currentStock: stock.toString(),
        minStockLevel: minStock.toString(),
        purchasePrice: buyPrice.toString(),
        sellingPrice: sellPrice.toString(),
        status: isLow ? 'Low' : 'Healthy',
      };

      stockOverview.push(itemData);

      if (isLow) {
        lowStockProducts.push(itemData);
      }
    }

    res.json({
      periodSales: {
        range: dateRange.range,
        rangeLabel: dateRange.label,
        totalAmount: periodSalesAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        invoiceCount: rangeInvoices.length,
        startDate: dateRange.start,
        endDate: dateRange.end,
      },
      todaySales: {
        totalAmount: todaySalesAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        invoiceCount: todayInvoices.length,
      },
      stockSummary: {
        totalStockValue: totalStockValue.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
        totalProductsCount: allProducts.length,
        lowStockCount: lowStockProducts.length,
      },
      stockOverview,
      lowStockProducts,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customer?.name || 'Walk-in Customer',
        customerMobile: inv.customer?.mobile || '',
        billAmount: inv.billAmount.toString(),
        paymentStatus: inv.paymentStatus,
      })),
    });
  } catch (error) {
    console.error('Error fetching operational dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary', details: error.message });
  }
});

// GET /dashboard/sales-trend - Grouped daily sales trend
router.get('/sales-trend', async (req, res) => {
  try {
    const range = (req.query.range || '7d').toLowerCase();
    const now = new Date();
    let startDate = new Date();
    let daysCount = 7;
    let rangeLabel = 'Last 7 Days';

    if (range === 'today') {
      startDate.setHours(0, 0, 0, 0);
      daysCount = 1;
      rangeLabel = 'Today';
    } else if (range === '30d') {
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      daysCount = 30;
      rangeLabel = 'Last 30 Days';
    } else if (range === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      daysCount = now.getDate();
      rangeLabel = 'This Month';
    } else {
      // 7d default
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      daysCount = 7;
      rangeLabel = 'Last 7 Days';
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        invoiceDate: {
          gte: startDate,
          lte: now,
        },
      },
      select: {
        invoiceDate: true,
        billAmount: true,
      },
      orderBy: { invoiceDate: 'asc' },
    });

    // Build day buckets map (YYYY-MM-DD -> { amount, count, label })
    const buckets = {};
    const dateCursor = new Date(startDate);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i < daysCount; i++) {
      const year = dateCursor.getFullYear();
      const month = String(dateCursor.getMonth() + 1).padStart(2, '0');
      const day = String(dateCursor.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;
      const label = `${dateCursor.getDate()} ${monthNames[dateCursor.getMonth()]}`;
      const weekday = dayNames[dateCursor.getDay()];

      buckets[key] = {
        date: key,
        label,
        weekday,
        amount: new Decimal(0),
        count: 0,
      };

      dateCursor.setDate(dateCursor.getDate() + 1);
    }

    let grandTotal = new Decimal(0);
    let totalCount = 0;

    for (const inv of invoices) {
      const d = new Date(inv.invoiceDate);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;

      if (buckets[key]) {
        buckets[key].amount = buckets[key].amount.plus(new Decimal(inv.billAmount));
        buckets[key].count += 1;
      }
      grandTotal = grandTotal.plus(new Decimal(inv.billAmount));
      totalCount += 1;
    }

    const trend = Object.values(buckets).map((b) => ({
      date: b.date,
      label: b.label,
      weekday: b.weekday,
      amount: Number(b.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)),
      count: b.count,
    }));

    res.json({
      range,
      rangeLabel,
      totalAmount: grandTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
      totalCount,
      trend,
    });
  } catch (error) {
    console.error('Error fetching sales trend:', error);
    res.status(500).json({ error: 'Failed to fetch sales trend', details: error.message });
  }
});

// Alias /stats -> /summary for backward compatibility
router.get('/stats', (req, res) => {
  res.redirect(307, '/dashboard/summary');
});

export default router;
