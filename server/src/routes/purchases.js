import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import { calculatePurchaseLineItem } from '../utils/billingMath.js';

const router = Router();
const Decimal = Prisma.Decimal;

/**
 * Helper to check for active recorded payments against a purchase.
 */
async function hasRecordedPayments(tx, entityId, entityType = 'PURCHASE') {
  const count = await tx.payment.count({
    where: {
      entityType,
      entityId,
      status: 'ACTIVE',
    },
  });
  if (count > 0) return true;
  const purchase = await tx.purchase.findUnique({
    where: { id: entityId },
    select: { paidAmount: true },
  });
  return new Decimal(purchase?.paidAmount || 0).gt(0);
}

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

// GET /purchases/:id/edits - get audit logs for purchase
router.get('/:id/edits', async (req, res) => {
  try {
    const edits = await prisma.editLog.findMany({
      where: {
        entityType: 'PURCHASE',
        entityId: req.params.id,
      },
      orderBy: { editedAt: 'desc' },
    });
    res.json(edits);
  } catch (error) {
    console.error('Error fetching purchase edit history:', error);
    res.status(500).json({ error: 'Failed to fetch purchase edit history', details: error.message });
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
      items, // array of { productId, qty, rate, gstRate?, isInclusive? }
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

    let parsedPurchaseDate = new Date();
    if (purchaseDate) {
      const d = new Date(purchaseDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid purchase date provided' });
      }
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      if (d > endOfToday) {
        return res.status(400).json({ error: 'Purchase date cannot be in the future' });
      }
      parsedPurchaseDate = d;
    }

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

        const isInclusive = item.isInclusive !== undefined ? item.isInclusive : true;

        // Calculate purchase line using 6-decimal precision
        const calc = calculatePurchaseLineItem({
          qty,
          rate,
          gstRate,
          isInclusive,
        });

        totalAmount = totalAmount.plus(calc.amount);

        preparedItems.push({
          productId: product.id,
          qty: calc.qty,
          rate: calc.rate,
          gstRate: calc.gstRate,
          taxableValue: calc.taxableValue,
          gstAmount: calc.gstAmount,
          isInclusive: calc.isInclusive,
          amount: calc.amount,
        });

        // Auto-update Product.purchasePrice using weighted average cost (based on unit taxable cost)
        const currentStockBefore = new Decimal(product.currentStock);
        const currentPurchasePrice = new Decimal(product.purchasePrice);

        let newPurchasePrice;
        if (currentStockBefore.lessThanOrEqualTo(0)) {
          newPurchasePrice = calc.unitTaxable.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
        } else {
          const totalExistingValue = currentStockBefore.mul(currentPurchasePrice);
          const totalNewValue = qty.mul(calc.unitTaxable);
          const totalQty = currentStockBefore.plus(qty);
          newPurchasePrice = totalExistingValue.plus(totalNewValue).div(totalQty).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
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
          purchaseDate: parsedPurchaseDate,
          totalAmount: totalAmount.toDecimalPlaces(6, Decimal.ROUND_HALF_UP),
          paidAmount: new Decimal(0),
          paymentStatus: 'UNPAID',
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
    }, { maxWait: 15000, timeout: 20000 });

    res.status(201).json(savedPurchase);
  } catch (error) {
    console.error('Error creating purchase:', error.message);
    res.status(400).json({ error: error.message || 'Failed to create purchase' });
  }
});

// PATCH /purchases/:id - Audited edit of purchase with atomic stock delta adjustments
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      reason,
      supplierId,
      referenceNumber,
      purchaseDate,
      notes,
      items, // array of { productId, qty, rate, gstRate?, isInclusive? }
    } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason for editing the purchase is required' });
    }

    const editReason = reason.trim();

    const updatedPurchase = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: {
          supplier: true,
          items: {
            include: { product: true },
          },
        },
      });

      if (!purchase) {
        throw new Error('Purchase not found');
      }

      if (purchase.status === 'CANCELLED') {
        throw new Error('Cannot edit a cancelled purchase');
      }

      // Check for active recorded payments
      if (await hasRecordedPayments(tx, purchase.id, 'PURCHASE')) {
        throw new Error('Cannot edit purchase: active payments have already been recorded against it. Void active payments first.');
      }

      const editLogs = [];

      // 1. Check supplier change
      let targetSupplierId = purchase.supplierId;
      if (supplierId && supplierId !== purchase.supplierId) {
        const newSupplier = await tx.supplier.findUnique({ where: { id: supplierId } });
        if (!newSupplier) throw new Error(`Supplier not found with id: ${supplierId}`);
        editLogs.push({
          entityType: 'PURCHASE',
          entityId: purchase.id,
          fieldChanged: 'Supplier',
          oldValue: purchase.supplier?.name || purchase.supplierId,
          newValue: newSupplier.name,
          reason: editReason,
        });
        targetSupplierId = newSupplier.id;
      }

      // 2. Check reference number change
      let targetRefNumber = purchase.referenceNumber;
      if (referenceNumber && referenceNumber.trim() !== purchase.referenceNumber) {
        editLogs.push({
          entityType: 'PURCHASE',
          entityId: purchase.id,
          fieldChanged: 'Reference Number',
          oldValue: purchase.referenceNumber,
          newValue: referenceNumber.trim(),
          reason: editReason,
        });
        targetRefNumber = referenceNumber.trim();
      }

      // 3. Check purchase date change
      let targetPurchaseDate = purchase.purchaseDate;
      if (purchaseDate) {
        const d = new Date(purchaseDate);
        if (isNaN(d.getTime())) {
          throw new Error('Invalid purchase date');
        }
        const oldDateStr = new Date(purchase.purchaseDate).toISOString().split('T')[0];
        const newDateStr = d.toISOString().split('T')[0];
        if (oldDateStr !== newDateStr) {
          editLogs.push({
            entityType: 'PURCHASE',
            entityId: purchase.id,
            fieldChanged: 'Purchase Date',
            oldValue: oldDateStr,
            newValue: newDateStr,
            reason: editReason,
          });
          targetPurchaseDate = d;
        }
      }

      // 4. Process line items if provided
      let finalTotalAmount = purchase.totalAmount;
      if (items && Array.isArray(items) && items.length > 0) {
        // Map old quantities per productId
        const oldQtyMap = new Map();
        const oldItemMap = new Map();
        for (const oldIt of purchase.items) {
          const prev = oldQtyMap.get(oldIt.productId) || new Decimal(0);
          oldQtyMap.set(oldIt.productId, prev.plus(new Decimal(oldIt.qty)));
          oldItemMap.set(oldIt.productId, oldIt);
        }

        const newQtyMap = new Map();
        const preparedItems = [];
        let newTotal = new Decimal(0);

        for (const it of items) {
          if (!it.productId) throw new Error('Each item must have a productId');
          const qty = new Decimal(it.qty || 0);
          if (qty.lte(0)) throw new Error('Quantity must be greater than zero');

          const product = await tx.product.findUnique({ where: { id: it.productId } });
          if (!product) throw new Error(`Product not found with id: ${it.productId}`);

          const rate = it.rate !== undefined && it.rate !== null
            ? new Decimal(it.rate)
            : new Decimal(product.purchasePrice);

          const gstRate = it.gstRate !== undefined && it.gstRate !== null
            ? new Decimal(it.gstRate)
            : new Decimal(product.gstRate);

          const isInclusive = it.isInclusive !== undefined ? it.isInclusive : true;

          const calc = calculatePurchaseLineItem({
            qty,
            rate,
            gstRate,
            isInclusive,
          });

          newTotal = newTotal.plus(calc.amount);

          preparedItems.push({
            purchaseId: purchase.id,
            productId: product.id,
            qty: calc.qty,
            rate: calc.rate,
            gstRate: calc.gstRate,
            taxableValue: calc.taxableValue,
            gstAmount: calc.gstAmount,
            isInclusive: calc.isInclusive,
            amount: calc.amount,
          });

          const currentNewQty = newQtyMap.get(product.id) || new Decimal(0);
          newQtyMap.set(product.id, currentNewQty.plus(qty));

          // Log detailed item diffs
          const oldIt = oldItemMap.get(product.id);
          if (oldIt) {
            if (!new Decimal(oldIt.qty).equals(calc.qty)) {
              editLogs.push({
                entityType: 'PURCHASE',
                entityId: purchase.id,
                fieldChanged: `Item: "${product.name}" - Quantity`,
                oldValue: `${new Decimal(oldIt.qty).toString()} ${product.unit || 'PCS'}`,
                newValue: `${calc.qty.toString()} ${product.unit || 'PCS'}`,
                reason: editReason,
              });
            }
            if (!new Decimal(oldIt.rate).equals(calc.rate)) {
              editLogs.push({
                entityType: 'PURCHASE',
                entityId: purchase.id,
                fieldChanged: `Item: "${product.name}" - Rate`,
                oldValue: `₹${new Decimal(oldIt.rate).toFixed(2)}`,
                newValue: `₹${calc.rate.toFixed(2)}`,
                reason: editReason,
              });
            }
            if (Boolean(oldIt.isInclusive) !== Boolean(calc.isInclusive)) {
              editLogs.push({
                entityType: 'PURCHASE',
                entityId: purchase.id,
                fieldChanged: `Item: "${product.name}" - Tax Mode`,
                oldValue: oldIt.isInclusive ? 'GST-Inclusive' : 'GST-Exclusive',
                newValue: calc.isInclusive ? 'GST-Inclusive' : 'GST-Exclusive',
                reason: editReason,
              });
            }
          } else {
            editLogs.push({
              entityType: 'PURCHASE',
              entityId: purchase.id,
              fieldChanged: `Item: "${product.name}" - Added`,
              oldValue: null,
              newValue: `${calc.qty.toString()} units @ ₹${calc.rate.toFixed(2)} (${calc.isInclusive ? 'Incl.' : 'Excl.'})`,
              reason: editReason,
            });
          }
        }

        // Check for removed items
        for (const oldIt of purchase.items) {
          if (!newQtyMap.has(oldIt.productId)) {
            editLogs.push({
              entityType: 'PURCHASE',
              entityId: purchase.id,
              fieldChanged: `Item: "${oldIt.product?.name || oldIt.productId}" - Removed`,
              oldValue: `${new Decimal(oldIt.qty).toString()} units`,
              newValue: null,
              reason: editReason,
            });
          }
        }

        // Apply delta stock changes per product
        const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
        for (const prodId of allProductIds) {
          const oldQty = oldQtyMap.get(prodId) || new Decimal(0);
          const newQty = newQtyMap.get(prodId) || new Decimal(0);
          const delta = newQty.minus(oldQty); // positive = stock in, negative = stock out

          if (delta.lt(0)) {
            // Purchased quantity decreased by decreaseAmt.
            // Atomically verify currentStock >= decreaseAmt using updateMany
            const decreaseAmt = delta.abs();
            const stockUpdated = await tx.product.updateMany({
              where: {
                id: prodId,
                currentStock: { gte: decreaseAmt },
              },
              data: {
                currentStock: { decrement: decreaseAmt },
              },
            });

            if (stockUpdated.count === 0) {
              const fresh = await tx.product.findUnique({
                where: { id: prodId },
                select: { name: true, currentStock: true },
              });
              const prodName = fresh?.name || prodId;
              const available = fresh?.currentStock?.toString() || '0';
              throw new Error(
                `Cannot reduce purchase quantity for "${prodName}": Insufficient stock. Available: ${available}, Required to decrement: ${decreaseAmt.toString()}. Some items may have already been sold.`
              );
            }

            await tx.stockTransaction.create({
              data: {
                productId: prodId,
                type: 'ADJUSTMENT',
                quantity: delta, // negative
                reference: `Purchase edit: ${targetRefNumber}`,
              },
            });
          } else if (delta.gt(0)) {
            // Additional quantity purchased -> increase currentStock
            await tx.product.update({
              where: { id: prodId },
              data: {
                currentStock: { increment: delta },
              },
            });

            await tx.stockTransaction.create({
              data: {
                productId: prodId,
                type: 'ADJUSTMENT',
                quantity: delta, // positive
                reference: `Purchase edit: ${targetRefNumber}`,
              },
            });
          }
        }

        // Replace old items with preparedItems
        await tx.purchaseItem.deleteMany({ where: { purchaseId: purchase.id } });
        await tx.purchaseItem.createMany({ data: preparedItems });

        if (!new Decimal(purchase.totalAmount).equals(newTotal)) {
          editLogs.push({
            entityType: 'PURCHASE',
            entityId: purchase.id,
            fieldChanged: 'Total Amount',
            oldValue: `₹${new Decimal(purchase.totalAmount).toFixed(2)}`,
            newValue: `₹${newTotal.toFixed(2)}`,
            reason: editReason,
          });
        }
        finalTotalAmount = newTotal;
      }

      // Write edit logs to DB
      if (editLogs.length > 0) {
        await tx.editLog.createMany({ data: editLogs });
      }

      // Update Purchase record
      const updated = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          supplierId: targetSupplierId,
          referenceNumber: targetRefNumber,
          purchaseDate: targetPurchaseDate,
          totalAmount: new Decimal(finalTotalAmount).toDecimalPlaces(6, Decimal.ROUND_HALF_UP),
          notes: notes !== undefined ? (notes ? notes.trim() : null) : purchase.notes,
        },
        include: {
          supplier: true,
          items: {
            include: { product: true },
          },
        },
      });

      return updated;
    }, { maxWait: 15000, timeout: 20000 });

    res.json(updatedPurchase);
  } catch (error) {
    console.error('Error editing purchase:', error.message);
    res.status(400).json({ error: error.message || 'Failed to edit purchase' });
  }
});

// POST /purchases/:id/cancel - Cancel mistaken purchase (atomic stock reduction with guard)
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const cancelledPurchase = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: {
          items: {
            include: { product: true },
          },
        },
      });

      if (!purchase) {
        throw new Error('Purchase not found');
      }

      if (purchase.status === 'CANCELLED') {
        throw new Error('Purchase is already cancelled');
      }

      // Block cancellation if active payments exist
      if (await hasRecordedPayments(tx, purchase.id, 'PURCHASE')) {
        throw new Error('Cannot cancel purchase: active payments have already been recorded against this purchase. Void active payments first.');
      }

      // Decrement stock for each item atomically using updateMany with currentStock >= qty guard.
      for (const item of purchase.items) {
        const itemQty = new Decimal(item.qty);

        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            currentStock: { gte: itemQty },
          },
          data: {
            currentStock: { decrement: itemQty },
          },
        });

        if (updated.count === 0) {
          const fresh = await tx.product.findUnique({
            where: { id: item.productId },
            select: { name: true, currentStock: true },
          });
          const prodName = fresh?.name || item.product?.name || item.productId;
          const availableStock = fresh?.currentStock?.toString() || '0';
          throw new Error(
            `Cannot cancel purchase: Insufficient stock for product "${prodName}". Available stock: ${availableStock}, Required to reverse: ${itemQty.toString()}. Some items may have already been sold.`
          );
        }

        // Record stock transaction of type PURCHASE_CANCELLED (negative qty for stock out)
        await tx.stockTransaction.create({
          data: {
            productId: item.productId,
            type: 'PURCHASE_CANCELLED',
            quantity: itemQty.negated(),
            reference: purchase.referenceNumber || purchase.id,
          },
        });
      }

      // Mark purchase as CANCELLED
      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason.trim(),
          cancelledAt: new Date(),
        },
        include: {
          supplier: true,
          items: {
            include: { product: true },
          },
        },
      });

      // Record edit log for cancellation
      await tx.editLog.create({
        data: {
          entityType: 'PURCHASE',
          entityId: purchase.id,
          fieldChanged: 'Status',
          oldValue: 'ACTIVE',
          newValue: 'CANCELLED',
          reason: reason.trim(),
        },
      });

      return updatedPurchase;
    }, { maxWait: 15000, timeout: 20000 });

    res.json(cancelledPurchase);
  } catch (error) {
    console.error('Error cancelling purchase:', error.message);
    res.status(400).json({ error: error.message || 'Failed to cancel purchase' });
  }
});

// POST /purchases/:id/payments - Record payment against purchase (atomically with FOR UPDATE row lock)
router.post('/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentDate, paymentMethod = 'CASH', notes } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    }

    const payAmount = new Decimal(amount);

    let parsedPaymentDate = new Date();
    if (paymentDate) {
      const d = new Date(paymentDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid payment date' });
      }
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      if (d > endOfToday) {
        return res.status(400).json({ error: 'Payment date cannot be in the future' });
      }
      parsedPaymentDate = d;
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Acquire row lock on Purchase to prevent concurrent overpayment
      await tx.$queryRaw`
        SELECT id FROM "Purchase"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const purchase = await tx.purchase.findUnique({
        where: { id },
      });

      if (!purchase) {
        throw new Error('Purchase not found');
      }

      if (purchase.status === 'CANCELLED') {
        throw new Error('Cannot record payment against a cancelled purchase');
      }

      const currentPaid = new Decimal(purchase.paidAmount || 0);
      const totalBill = new Decimal(purchase.totalAmount);
      const newPaid = currentPaid.plus(payAmount);

      if (newPaid.greaterThan(totalBill)) {
        const remaining = totalBill.minus(currentPaid);
        throw new Error(
          `Payment of ₹${payAmount.toFixed(2)} exceeds remaining balance of ₹${remaining.toFixed(2)} (Purchase: ₹${totalBill.toFixed(2)}, Already paid: ₹${currentPaid.toFixed(2)})`
        );
      }

      const newStatus = newPaid.greaterThanOrEqualTo(totalBill)
        ? 'PAID'
        : (newPaid.greaterThan(0) ? 'PARTIAL' : 'UNPAID');

      const payment = await tx.payment.create({
        data: {
          entityType: 'PURCHASE',
          entityId: purchase.id,
          amount: payAmount,
          paymentDate: parsedPaymentDate,
          paymentMethod: paymentMethod || 'CASH',
          notes: notes ? notes.trim() : null,
          status: 'ACTIVE',
        },
      });

      const updatedPurchase = await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          paidAmount: newPaid,
          paymentStatus: newStatus,
        },
      });

      return { payment, purchase: updatedPurchase };
    }, { maxWait: 15000, timeout: 20000 });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error recording purchase payment:', error.message);
    res.status(400).json({ error: error.message || 'Failed to record payment' });
  }
});

// GET /purchases/:id/payments - List payments for purchase
router.get('/:id/payments', async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        entityType: 'PURCHASE',
        entityId: req.params.id,
      },
      orderBy: { paymentDate: 'desc' },
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching purchase payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments', details: error.message });
  }
});

export default router;

