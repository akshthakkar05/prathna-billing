import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();
const Decimal = Prisma.Decimal;

/**
 * Helper to void a payment safely with atomic row-level locks on parent entity.
 */
async function handleVoidPayment(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A reason is required to void a recorded payment' });
    }

    const voidReason = reason.trim();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch payment
      const payment = await tx.payment.findUnique({
        where: { id },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status === 'VOIDED') {
        throw new Error('Payment is already voided');
      }

      const payAmount = new Decimal(payment.amount);

      // 2. Lock and update parent entity (Invoice or Purchase)
      if (payment.entityType === 'INVOICE') {
        await tx.$queryRaw`
          SELECT id FROM "Invoice"
          WHERE id = ${payment.entityId}
          FOR UPDATE
        `;

        const invoice = await tx.invoice.findUnique({
          where: { id: payment.entityId },
        });

        if (!invoice) {
          throw new Error('Associated invoice not found');
        }

        const currentPaid = new Decimal(invoice.paidAmount || 0);
        const newPaid = Decimal.max(0, currentPaid.minus(payAmount));
        const totalBill = new Decimal(invoice.billAmount);

        const newStatus = newPaid.greaterThanOrEqualTo(totalBill)
          ? 'PAID'
          : (newPaid.greaterThan(0) ? 'PARTIAL' : 'UNPAID');

        // Update Invoice running paidAmount & paymentStatus
        const updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaid,
            paymentStatus: newStatus,
          },
        });

        // Soft-void the payment
        const voidedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'VOIDED',
            voidReason,
            voidedAt: new Date(),
          },
        });

        // Record EditLog entry
        await tx.editLog.create({
          data: {
            entityType: 'INVOICE',
            entityId: invoice.id,
            fieldChanged: 'Payment Voided',
            oldValue: `₹${payAmount.toFixed(2)} (${payment.paymentMethod})`,
            newValue: 'VOIDED',
            reason: voidReason,
          },
        });

        return { payment: voidedPayment, parent: updatedInvoice };
      } else if (payment.entityType === 'PURCHASE') {
        await tx.$queryRaw`
          SELECT id FROM "Purchase"
          WHERE id = ${payment.entityId}
          FOR UPDATE
        `;

        const purchase = await tx.purchase.findUnique({
          where: { id: payment.entityId },
        });

        if (!purchase) {
          throw new Error('Associated purchase not found');
        }

        const currentPaid = new Decimal(purchase.paidAmount || 0);
        const newPaid = Decimal.max(0, currentPaid.minus(payAmount));
        const totalBill = new Decimal(purchase.totalAmount);

        const newStatus = newPaid.greaterThanOrEqualTo(totalBill)
          ? 'PAID'
          : (newPaid.greaterThan(0) ? 'PARTIAL' : 'UNPAID');

        const updatedPurchase = await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            paidAmount: newPaid,
            paymentStatus: newStatus,
          },
        });

        const voidedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'VOIDED',
            voidReason,
            voidedAt: new Date(),
          },
        });

        await tx.editLog.create({
          data: {
            entityType: 'PURCHASE',
            entityId: purchase.id,
            fieldChanged: 'Payment Voided',
            oldValue: `₹${payAmount.toFixed(2)} (${payment.paymentMethod})`,
            newValue: 'VOIDED',
            reason: voidReason,
          },
        });

        return { payment: voidedPayment, parent: updatedPurchase };
      } else {
        throw new Error(`Unsupported payment entityType: ${payment.entityType}`);
      }
    }, { maxWait: 15000, timeout: 20000 });

    res.json(result);
  } catch (error) {
    console.error('Error voiding payment:', error.message);
    res.status(400).json({ error: error.message || 'Failed to void payment' });
  }
}

// POST /payments/:id/void - Void an active payment with reason
router.post('/:id/void', handleVoidPayment);

// DELETE /payments/:id - Alias for voiding payment
router.delete('/:id', handleVoidPayment);

export default router;
