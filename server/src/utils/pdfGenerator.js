import PDFDocument from 'pdfkit';

/**
 * Generates a clean, professional standard A4 GST Tax Invoice PDF buffer.
 * @param {Object} invoice Invoice model with customer and items
 * @param {Object} company CompanySettings model
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePDF(invoice, company) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36, // 0.5 inch
        info: {
          Title: `Invoice ${invoice.invoiceNumber}`,
          Author: company?.name || 'Prathna Enterprises',
          Subject: 'GST Tax Invoice',
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const compName = company?.name || 'Prathna Enterprises';
      const compAddress = company?.address || '42, Industrial Estate, Ahmedabad, Gujarat';
      const compPhone = company?.phone || '+91 98765 43210';
      const compGstin = company?.gstin || '24AAACP9988P1Z8';
      const compPan = company?.pan || 'AAACP9988P';
      const termsText = company?.terms || '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.';

      const pageWidth = 595.28;
      const contentWidth = pageWidth - 72; // 523.28

      // ==========================================
      // 1. HEADER SECTION
      // ==========================================
      doc.rect(36, 36, contentWidth, 80).fill('#0f172a');

      // Company Title in Header
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold');
      doc.text(compName.toUpperCase(), 50, 48);

      doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica');
      doc.text(compAddress, 50, 70, { width: 300 });
      doc.text(`Phone: ${compPhone} | GSTIN: ${compGstin} | PAN: ${compPan}`, 50, 92);

      // Tax Invoice Badge on the right
      doc.fillColor('#38bdf8').fontSize(14).font('Helvetica-Bold');
      doc.text('TAX INVOICE', 380, 48, { width: 170, align: 'right' });

      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold');
      doc.text(invoice.invoiceNumber, 380, 68, { width: 170, align: 'right' });

      doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica');
      const invDate = new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      doc.text(`Date: ${invDate}`, 380, 84, { width: 170, align: 'right' });
      doc.text(`Status: ${invoice.paymentStatus}`, 380, 97, { width: 170, align: 'right' });

      // ==========================================
      // 2. BILLED TO & SUPPLY SECTION
      // ==========================================
      let y = 126;
      doc.rect(36, y, contentWidth, 68).fill('#f8fafc');
      doc.rect(36, y, contentWidth, 68).stroke('#e2e8f0');

      doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
      doc.text('BILLED TO (CUSTOMER):', 50, y + 10);
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold');
      doc.text(invoice.customer?.name || 'Cash Customer', 50, y + 22);

      doc.fillColor('#475569').fontSize(8.5).font('Helvetica');
      const custPhone = invoice.customer?.mobile ? `Phone: ${invoice.customer.mobile}` : '';
      const custAddr = invoice.customer?.address ? `Address: ${invoice.customer.address}` : '';
      doc.text(`${custPhone} ${custAddr ? ' | ' + custAddr : ''}`, 50, y + 36, { width: 320 });

      const custGstin = invoice.customer?.gstin ? `GSTIN: ${invoice.customer.gstin}` : 'Unregistered Consumer';
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
      doc.text(custGstin, 50, y + 50);

      // Place of Supply info
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5);
      doc.text('State: Gujarat (24)', 380, y + 22, { width: 165, align: 'right' });
      doc.text('Reverse Charge: No', 380, y + 36, { width: 165, align: 'right' });
      doc.text(`Payment: ${invoice.paymentMethod || 'CASH'}`, 380, y + 50, { width: 165, align: 'right' });

      // ==========================================
      // 3. ITEMS TABLE
      // ==========================================
      y = 204;
      doc.rect(36, y, contentWidth, 22).fill('#e2e8f0');

      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
      doc.text('#', 42, y + 7, { width: 20 });
      doc.text('DESCRIPTION OF GOODS', 64, y + 7, { width: 170 });
      doc.text('HSN', 236, y + 7, { width: 45, align: 'center' });
      doc.text('QTY', 283, y + 7, { width: 35, align: 'right' });
      doc.text('RATE (Rs)', 320, y + 7, { width: 55, align: 'right' });
      doc.text('TAXABLE', 377, y + 7, { width: 55, align: 'right' });
      doc.text('GST (C+S)', 434, y + 7, { width: 55, align: 'right' });
      doc.text('TOTAL (Rs)', 491, y + 7, { width: 62, align: 'right' });

      y += 22;
      doc.font('Helvetica').fontSize(8);

      if (invoice.items && invoice.items.length > 0) {
        invoice.items.forEach((item, index) => {
          const rowBg = index % 2 === 1 ? '#f8fafc' : '#ffffff';
          doc.rect(36, y, contentWidth, 20).fill(rowBg);
          doc.rect(36, y, contentWidth, 20).stroke('#f1f5f9');

          const gstTotal = (Number(item.cgstAmount || 0) + Number(item.sgstAmount || 0)).toFixed(2);
          const gstRatePct = Number(item.gstRateSnapshot || 0);

          doc.fillColor('#475569').text(String(index + 1), 42, y + 5, { width: 20 });
          doc.fillColor('#0f172a').font('Helvetica-Bold').text(item.descriptionSnapshot || '', 64, y + 5, { width: 170 });
          doc.font('Helvetica').fillColor('#64748b').text(item.hsnSnapshot || '—', 236, y + 5, { width: 45, align: 'center' });
          doc.fillColor('#0f172a').text(String(Number(item.qty)), 283, y + 5, { width: 35, align: 'right' });
          doc.text(Number(item.rate).toFixed(2), 320, y + 5, { width: 55, align: 'right' });
          doc.text(Number(item.taxableValue).toFixed(2), 377, y + 5, { width: 55, align: 'right' });
          doc.text(`${gstTotal} (${gstRatePct}%)`, 434, y + 5, { width: 55, align: 'right' });
          doc.font('Helvetica-Bold').text(Number(item.amount).toFixed(2), 491, y + 5, { width: 62, align: 'right' });

          y += 20;
        });
      }

      // ==========================================
      // 4. TOTALS & SUMMARY BLOCK
      // ==========================================
      y += 10;
      const summaryStartY = y;

      // Left Box: Terms & Conditions
      doc.rect(36, summaryStartY, 280, 110).fill('#f8fafc');
      doc.rect(36, summaryStartY, 280, 110).stroke('#e2e8f0');

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      doc.text('TERMS & CONDITIONS:', 46, summaryStartY + 10);
      doc.fillColor('#64748b').font('Helvetica').fontSize(7.5);
      doc.text(termsText, 46, summaryStartY + 24, { width: 260, lineGap: 3 });

      // Right Box: Totals Table
      doc.rect(326, summaryStartY, 233, 110).fill('#ffffff');
      doc.rect(326, summaryStartY, 233, 110).stroke('#e2e8f0');

      let ty = summaryStartY + 10;
      const addTotalRow = (label, val, bold = false) => {
        doc.fillColor(bold ? '#0f172a' : '#64748b')
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 9.5 : 8.5);
        doc.text(label, 338, ty);
        doc.text(`Rs. ${val}`, 440, ty, { width: 110, align: 'right' });
        ty += 16;
      };

      addTotalRow('Taxable Total:', Number(invoice.taxableTotal || 0).toFixed(2));
      addTotalRow('CGST Total:', Number(invoice.cgstTotal || 0).toFixed(2));
      addTotalRow('SGST Total:', Number(invoice.sgstTotal || 0).toFixed(2));
      if (Number(invoice.roundOff || 0) !== 0) {
        addTotalRow('Round Off:', Number(invoice.roundOff).toFixed(2));
      }

      // Grand Bill Amount Bar
      doc.rect(326, summaryStartY + 76, 233, 34).fill('#0f172a');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
      doc.text('GRAND TOTAL:', 338, summaryStartY + 87);
      doc.fillColor('#38bdf8').fontSize(13);
      doc.text(`Rs. ${Number(invoice.billAmount || 0).toFixed(2)}`, 430, summaryStartY + 86, { width: 120, align: 'right' });

      // ==========================================
      // 5. SIGNATURE & FOOTER
      // ==========================================
      const footerY = summaryStartY + 130;
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8);
      doc.text('This is a computer-generated invoice and does not require a physical seal.', 36, footerY + 25);

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
      doc.text(`For ${compName}`, 360, footerY, { width: 199, align: 'right' });
      doc.fillColor('#64748b').font('Helvetica').fontSize(8);
      doc.text('Authorized Signatory', 360, footerY + 36, { width: 199, align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
