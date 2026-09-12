import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gujaratiFontPath = path.resolve(__dirname, '../../assets/fonts/NotoSansGujarati-Regular.ttf');

const DEFAULT_GUJARATI_TERMS = `શરતો અને નિયમો:

1. એકવાર વેચાયેલો માલ પાછો લેવામાં કે બદલવામાં આવશે નહીં.
2. વોરંટી ગ્રાહકે કંપની પાસેથી મેળવવાની રહેશે.
3. ન્યાય ક્ષેત્ર સ્થાનિક રહેશે.`;

/**
 * Converts a numerical currency amount to Indian Numbering words (Lakhs / Crores).
 * Example: 17700 -> "Rupees Seventeen Thousand Seven Hundred Only"
 * @param {number|string} amount
 * @returns {string}
 */
export function numberToIndianWords(amount) {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n === 0) return '';
    if (n < 20) return a[n];
    const tens = b[Math.floor(n / 10)];
    const units = a[n % 10];
    return units ? `${tens} ${units}` : tens;
  }

  function convertThreeDigits(n) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundreds > 0) res += `${a[hundreds]} Hundred`;
    if (rest > 0) {
      if (res) res += ' ';
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const num = Math.floor(Number(amount));
  const paise = Math.round((Number(amount) - num) * 100);

  if (isNaN(num) || (num === 0 && paise === 0)) return 'Rupees Zero Only';

  const parts = [];
  if (num > 0) {
    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const remainder = num % 1000;

    if (crore > 0) parts.push(`${convertTwoDigits(crore)} Crore`);
    if (lakh > 0) parts.push(`${convertTwoDigits(lakh)} Lakh`);
    if (thousand > 0) parts.push(`${convertTwoDigits(thousand)} Thousand`);
    if (remainder > 0) parts.push(convertThreeDigits(remainder));
  }

  let result = num > 0 ? `Rupees ${parts.join(' ')}` : 'Rupees Zero';
  if (paise > 0) {
    result += ` and ${convertTwoDigits(paise)} Paise`;
  }

  return `${result} Only`;
}

/**
 * Checks if a string contains Gujarati Unicode characters (U+0A80 to U+0AFF).
 * @param {string} str
 * @returns {boolean}
 */
export function hasGujaratiChars(str) {
  return /[\u0A80-\u0AFF]/.test(str);
}

/**
 * Splits text into segments alternating between Gujarati and Latin/number scripts.
 * @param {string} text
 * @returns {Array<{ text: string, isGujarati: boolean }>}
 */
export function segmentTextByScript(text) {
  if (!text) return [];

  const segments = [];
  const regex = /([\u0A80-\u0AFF\s]+|[^\u0A80-\u0AFF]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const chunk = match[0];
    if (chunk) {
      segments.push({
        text: chunk,
        isGujarati: hasGujaratiChars(chunk),
      });
    }
  }

  return segments;
}

/**
 * Renders mixed text switching fonts per script segment.
 * Ensures zero tofu boxes for English lines or company names.
 */
export function renderMixedText(doc, fullText, x, y, width, fontSize = 7.5, lineSpacing = 2.8) {
  const lines = fullText.split('\n');
  let currentY = y;

  for (const line of lines) {
    if (!line.trim()) {
      currentY += fontSize + lineSpacing;
      continue;
    }

    const segments = segmentTextByScript(line);
    let currentX = x;

    for (const seg of segments) {
      const fontName = seg.isGujarati ? 'gujarati' : 'Helvetica';
      doc.font(fontName).fontSize(fontSize);

      if (seg.isGujarati) {
        doc.fillColor('#334155');
      } else {
        doc.fillColor('#0f172a');
      }

      doc.text(seg.text, currentX, currentY, {
        lineBreak: false,
        continued: false,
      });

      currentX += doc.widthOfString(seg.text);
    }

    currentY += fontSize + lineSpacing;
  }

  doc.font('Helvetica');
  return currentY;
}

/**
 * Generates a clean, professional standard A4 GST Tax Invoice PDF buffer.
 * @param {Object} invoice Invoice model with customer and items
 * @param {Object} company CompanySettings model
 * @param {Object} options Configuration options like copy designation ({ copy: 'Original' })
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePDF(invoice, company, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const copyType = options.copy || 'Original';

      const doc = new PDFDocument({
        size: 'A4',
        margin: 36, // 0.5 inch
        info: {
          Title: `Invoice ${invoice.invoiceNumber}`,
          Author: company?.name || 'Your Company Name',
          Subject: 'GST Tax Invoice',
        },
      });

      const hasGujaratiFont = fs.existsSync(gujaratiFontPath);
      if (hasGujaratiFont) {
        doc.registerFont('gujarati', gujaratiFontPath);
      }

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const compName = company?.name ? company.name.trim() : 'Your Company Name';
      const compAddress = company?.address ? company.address.trim() : '';
      const compPhone = company?.phone ? company.phone.trim() : '';
      const compGstin = company?.gstin ? company.gstin.trim().toUpperCase() : '';
      const compPan = company?.pan ? company.pan.trim().toUpperCase() : '';
      const termsText = company?.terms ? company.terms.trim() : '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.';
      const termsGujarati = company?.termsGujarati !== undefined && company?.termsGujarati !== null
        ? company.termsGujarati.trim()
        : DEFAULT_GUJARATI_TERMS;

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
      if (compAddress) {
        doc.text(compAddress, 50, 70, { width: 300 });
      }
      const headerMeta = [];
      if (compPhone) headerMeta.push(`Phone: ${compPhone}`);
      if (compGstin) headerMeta.push(`GSTIN: ${compGstin}`);
      if (compPan) headerMeta.push(`PAN: ${compPan}`);
      if (headerMeta.length > 0) {
        doc.text(headerMeta.join(' | '), 50, compAddress ? 92 : 75);
      }

      // Tax Invoice & Copy Badge on the right
      doc.fillColor('#38bdf8').fontSize(13).font('Helvetica-Bold');
      doc.text('TAX INVOICE', 360, 44, { width: 190, align: 'right' });

      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica-Bold');
      doc.text(`(${copyType.toUpperCase()} FOR RECIPIENT)`, 360, 58, { width: 190, align: 'right' });

      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold');
      doc.text(invoice.invoiceNumber, 360, 70, { width: 190, align: 'right' });

      doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica');
      const invDate = new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      doc.text(`Date: ${invDate}`, 360, 85, { width: 190, align: 'right' });
      doc.text(`Status: ${invoice.paymentStatus}`, 360, 98, { width: 190, align: 'right' });

      // ==========================================
      // 2. BILLED TO & SUPPLY SECTION
      // ==========================================
      let y = 124;
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
      const stateCode = compGstin && compGstin.length >= 2 ? compGstin.slice(0, 2) : '24';
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5);
      doc.text(`State Code: ${stateCode}`, 380, y + 22, { width: 165, align: 'right' });
      doc.text('Reverse Charge: No', 380, y + 36, { width: 165, align: 'right' });
      doc.text(`Payment: ${invoice.paymentMethod || 'CASH'}`, 380, y + 50, { width: 165, align: 'right' });

      // ==========================================
      // 3. ITEMS TABLE (WITH UNIT & CLARIFIED GST%)
      // ==========================================
      y = 200;
      doc.rect(36, y, contentWidth, 22).fill('#e2e8f0');

      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold');
      doc.text('#', 40, y + 7, { width: 20 });
      doc.text('DESCRIPTION OF GOODS', 62, y + 7, { width: 175 });
      doc.text('HSN', 240, y + 7, { width: 42, align: 'center' });
      doc.text('QTY', 284, y + 7, { width: 32, align: 'right' });
      doc.text('UNIT', 318, y + 7, { width: 38, align: 'center' });
      doc.text('RATE (Rs)', 358, y + 7, { width: 48, align: 'right' });
      doc.text('TAXABLE', 408, y + 7, { width: 54, align: 'right' });
      doc.text('GST %', 464, y + 7, { width: 35, align: 'center' });
      doc.text('TOTAL (Rs)', 501, y + 7, { width: 54, align: 'right' });

      y += 22;
      doc.font('Helvetica').fontSize(8);

      if (invoice.items && invoice.items.length > 0) {
        invoice.items.forEach((item, index) => {
          const rowBg = index % 2 === 1 ? '#f8fafc' : '#ffffff';
          doc.rect(36, y, contentWidth, 20).fill(rowBg);
          doc.rect(36, y, contentWidth, 20).stroke('#f1f5f9');

          const gstRatePct = Number(item.gstRateSnapshot !== undefined && item.gstRateSnapshot !== null ? item.gstRateSnapshot : 0);
          const unitStr = item.product?.unit || item.unit || 'PCS';

          doc.fillColor('#475569').text(String(index + 1), 40, y + 5, { width: 20 });
          doc.fillColor('#0f172a').font('Helvetica-Bold').text(item.descriptionSnapshot || '', 62, y + 5, { width: 175 });
          doc.font('Helvetica').fillColor('#64748b').text(item.hsnSnapshot || '—', 240, y + 5, { width: 42, align: 'center' });
          doc.fillColor('#0f172a').text(String(Number(item.qty)), 284, y + 5, { width: 32, align: 'right' });
          doc.fillColor('#64748b').text(unitStr, 318, y + 5, { width: 38, align: 'center' });
          doc.fillColor('#0f172a').text(Number(item.rate).toFixed(2), 358, y + 5, { width: 48, align: 'right' });
          doc.text(Number(item.taxableValue).toFixed(2), 408, y + 5, { width: 54, align: 'right' });
          doc.fillColor('#475569').text(`${gstRatePct}%`, 464, y + 5, { width: 35, align: 'center' });
          doc.font('Helvetica-Bold').fillColor('#0f172a').text(Number(item.amount).toFixed(2), 501, y + 5, { width: 54, align: 'right' });

          y += 20;
        });
      }

      // ==========================================
      // 4. TOTALS & TERMS BLOCK
      // ==========================================
      y += 10;
      const summaryStartY = y;
      const boxHeight = 118;

      // Left Box: Terms & Conditions with Segmented Mixed Gujarati/English Font
      doc.rect(36, summaryStartY, 280, boxHeight).fill('#f8fafc');
      doc.rect(36, summaryStartY, 280, boxHeight).stroke('#e2e8f0');

      if (termsGujarati && hasGujaratiFont) {
        renderMixedText(doc, termsGujarati, 46, summaryStartY + 10, 260, 7.5, 2.8);
      } else {
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
        doc.text('TERMS & CONDITIONS:', 46, summaryStartY + 10);
        doc.fillColor('#64748b').font('Helvetica').fontSize(7.5);
        doc.text(termsText, 46, summaryStartY + 24, { width: 260, lineGap: 3 });
      }
      doc.font('Helvetica');

      // Right Box: Totals Table with Labeled CGST/SGST Rates
      doc.rect(326, summaryStartY, 233, boxHeight).fill('#ffffff');
      doc.rect(326, summaryStartY, 233, boxHeight).stroke('#e2e8f0');

      // Determine effective CGST/SGST rate from items
      const sampleGstRate = invoice.items && invoice.items.length > 0 && invoice.items[0].gstRateSnapshot !== undefined
        ? Number(invoice.items[0].gstRateSnapshot)
        : 0;
      const halfRate = (sampleGstRate / 2).toFixed(1).replace(/\.0$/, '');

      let ty = summaryStartY + 8;
      const addTotalRow = (label, val, bold = false) => {
        doc.fillColor(bold ? '#0f172a' : '#475569')
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 9.5 : 8.5);
        doc.text(label, 338, ty);
        doc.text(`Rs. ${val}`, 440, ty, { width: 110, align: 'right' });
        ty += 15;
      };

      addTotalRow('Taxable Total:', Number(invoice.taxableTotal || 0).toFixed(2));
      const cgstLabel = Number(halfRate) > 0 ? `CGST @ ${halfRate}%:` : 'CGST:';
      const sgstLabel = Number(halfRate) > 0 ? `SGST @ ${halfRate}%:` : 'SGST:';
      addTotalRow(cgstLabel, Number(invoice.cgstTotal || 0).toFixed(2));
      addTotalRow(sgstLabel, Number(invoice.sgstTotal || 0).toFixed(2));
      if (Number(invoice.roundOff || 0) !== 0) {
        addTotalRow('Round Off:', Number(invoice.roundOff).toFixed(2));
      }

      // Grand Bill Amount Bar
      doc.rect(326, summaryStartY + 84, 233, 34).fill('#0f172a');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10.5);
      doc.text('GRAND TOTAL:', 338, summaryStartY + 95);
      doc.fillColor('#38bdf8').fontSize(12.5);
      doc.text(`Rs. ${Number(invoice.billAmount || 0).toFixed(2)}`, 430, summaryStartY + 94, { width: 120, align: 'right' });

      // ==========================================
      // 5. AMOUNT IN WORDS
      // ==========================================
      const wordsY = summaryStartY + boxHeight + 8;
      doc.rect(36, wordsY, contentWidth, 22).fill('#f8fafc');
      doc.rect(36, wordsY, contentWidth, 22).stroke('#e2e8f0');

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      doc.text('Amount in Words:', 46, wordsY + 6);
      doc.fillColor('#334155').font('Helvetica').fontSize(8);
      const amountWords = numberToIndianWords(invoice.billAmount || 0);
      doc.text(amountWords, 130, wordsY + 6, { width: 390 });

      // ==========================================
      // 6. SIGNATURE SECTION (TWO-SIDED) & FOOTER
      // ==========================================
      // Pull signature upward tightening the vertical rhythm
      const sigY = wordsY + 36;

      // Left: Customer Signature
      doc.strokeColor('#cbd5e1').lineWidth(0.8);
      doc.moveTo(46, sigY + 32).lineTo(180, sigY + 32).stroke();
      doc.fillColor('#475569').font('Helvetica').fontSize(8);
      doc.text("Customer's Signature", 46, sigY + 36);

      // Right: For Company / Authorised Signatory
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
      doc.text(`For ${compName}`, 360, sigY + 2, { width: 190, align: 'right' });
      doc.strokeColor('#cbd5e1').lineWidth(0.8);
      doc.moveTo(410, sigY + 32).lineTo(550, sigY + 32).stroke();
      doc.fillColor('#475569').font('Helvetica').fontSize(8);
      doc.text('Authorised Signatory', 360, sigY + 36, { width: 190, align: 'right' });

      // Disclaimer Note at center bottom
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5);
      doc.text(
        'This is a computer-generated invoice and does not require a physical seal.',
        36,
        sigY + 54,
        { width: contentWidth, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
