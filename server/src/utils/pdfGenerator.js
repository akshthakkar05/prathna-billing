import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getStateNameByCode, resolveCustomerStateCode } from './gstStates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gujaratiFontPath = path.resolve(__dirname, '../../assets/fonts/NotoSansGujarati-Regular.ttf');
const gujaratiBoldFontPath = path.resolve(__dirname, '../../assets/fonts/NotoSansGujarati-Bold.ttf');

const DEFAULT_GUJARATI_TERMS = `૧. વેચેલો માલ પાછો લેવામાં આવશે નહીં.
૨. બિલની રકમ સમયસર ન ચૂકવાય તો વાર્ષિક ૧૮% વ્યાજ લેવામાં આવશે.
૩. તમામ વિવાદો અમદાવાદ ન્યાયાલયને આધીન રહેશે.`;

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
 * @param {PDFKit.PDFDocument} doc
 * @param {string} fullText
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} [fontSize=7.5]
 * @param {number} [lineSpacing=2.8]
 * @param {boolean} [isBold=false]
 * @param {string} [customColor=null]
 */
export function renderMixedText(doc, fullText, x, y, width, fontSize = 7.5, lineSpacing = 2.8, isBold = false, customColor = null) {
  const lines = fullText.split('\n');
  let currentY = y;
  const hasBoldGujarati = fs.existsSync(gujaratiBoldFontPath);

  for (const line of lines) {
    if (!line.trim()) {
      currentY += fontSize + lineSpacing;
      continue;
    }

    const segments = segmentTextByScript(line);
    let currentX = x;

    for (const seg of segments) {
      let fontName = 'Helvetica';
      if (seg.isGujarati) {
        fontName = isBold && hasBoldGujarati ? 'gujarati-bold' : 'gujarati';
      } else {
        fontName = isBold ? 'Helvetica-Bold' : 'Helvetica';
      }

      doc.font(fontName).fontSize(fontSize);

      if (customColor) {
        doc.fillColor(customColor);
      } else if (isBold) {
        doc.fillColor('#0f172a');
      } else if (seg.isGujarati) {
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
      const hasGujaratiBoldFont = fs.existsSync(gujaratiBoldFontPath);
      if (hasGujaratiBoldFont) {
        doc.registerFont('gujarati-bold', gujaratiBoldFontPath);
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

      // Resolve logo file if present
      let hasRenderedLogo = false;
      if (company?.logoUrl) {
        try {
          const cleanUrl = company.logoUrl.split('?')[0];
          const relPath = cleanUrl.replace(/^\/?(api\/)?/, '');
          const resolvedLogoPath = path.resolve(__dirname, '../../', relPath);
          if (fs.existsSync(resolvedLogoPath)) {
            // Render logo graphic (fits neatly in header height)
            doc.image(resolvedLogoPath, 48, 42, { fit: [74, 68] });
            hasRenderedLogo = true;
          }
        } catch (logoErr) {
          console.error('Error rendering logo in PDF, falling back to text:', logoErr);
          hasRenderedLogo = false;
        }
      }

      const line1Meta = [];
      if (compPhone) line1Meta.push(`Phone: ${compPhone}`);
      if (compGstin) line1Meta.push(`GSTIN: ${compGstin}`);

      if (hasRenderedLogo) {
        // Since logo already contains branding graphic, place address / GSTIN / PAN alongside the logo
        if (compAddress) {
          doc.fillColor('#e2e8f0').fontSize(8).font('Helvetica');
          doc.text(compAddress, 132, 44, { width: 225 });
        }
        
        let metaY = compAddress ? 68 : 50;
        doc.fillColor('#94a3b8').fontSize(7.8).font('Helvetica');
        if (line1Meta.length > 0) {
          doc.text(line1Meta.join(' | '), 132, metaY, { width: 225 });
          metaY += 10.5;
        }
        if (compPan) {
          doc.text(`PAN: ${compPan}`, 132, metaY, { width: 225 });
        }
      } else {
        // Fallback: Text-only header
        doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold');
        doc.text(compName.toUpperCase(), 50, 44);

        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica');
        let textY = 62;
        if (compAddress) {
          doc.text(compAddress, 50, textY, { width: 300 });
          textY += 18;
        }
        if (line1Meta.length > 0) {
          doc.text(line1Meta.join(' | '), 50, textY);
          textY += 10.5;
        }
        if (compPan) {
          doc.text(`PAN: ${compPan}`, 50, textY);
        }
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

      doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold');
      doc.text('BILLED TO (CUSTOMER):', 48, y + 8);
      
      doc.fillColor('#0f172a').fontSize(9.5).font('Helvetica-Bold');
      doc.text(invoice.customer?.name || 'Cash Customer', 48, y + 20, { width: 270 });

      // Phone & GSTIN on dedicated line
      const custMeta = [];
      if (invoice.customer?.mobile) custMeta.push(`Phone: ${invoice.customer.mobile}`);
      const custGstin = invoice.customer?.gstin ? `GSTIN: ${invoice.customer.gstin}` : 'Unregistered Consumer';
      custMeta.push(custGstin);

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      doc.text(custMeta.join(' | '), 48, y + 34, { width: 270 });

      // Address on dedicated bottom line
      doc.fillColor('#475569').font('Helvetica').fontSize(7.5);
      const custAddr = invoice.customer?.address ? invoice.customer.address : 'Counter Sale';
      doc.text(`Address: ${custAddr}`, 48, y + 47, { width: 270, height: 16 });

      // Place of Supply info (Mandatory GST compliance)
      const customerStateCode = resolveCustomerStateCode(invoice.customer) || invoice.customer?.state || '24';
      const placeOfSupplyName = getStateNameByCode(customerStateCode);

      doc.fillColor('#475569').font('Helvetica').fontSize(8.5);
      doc.text(`Place of Supply: ${placeOfSupplyName} (${customerStateCode})`, 330, y + 10, { width: 215, align: 'right' });
      doc.text('Reverse Charge: No', 330, y + 24, { width: 215, align: 'right' });
      doc.text(`Payment: ${invoice.paymentMethod || 'CASH'}`, 330, y + 38, { width: 215, align: 'right' });

      // ==========================================
      // 3. ITEMS TABLE (WITH UNIT & CLARIFIED GST%)
      // ==========================================
      y = 200;
      doc.rect(36, y, contentWidth, 22).fill('#e2e8f0');

      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold');
      doc.text('#', 40, y + 7, { width: 20 });
      doc.text('DESCRIPTION OF GOODS', 62, y + 7, { width: 175 });
      doc.text('HSN/SAC', 238, y + 7, { width: 46, align: 'center' });
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
      // 4. TOTALS BREAKDOWN & FULL RECTANGLE GRAND TOTAL
      // ==========================================
      y += 8;
      const isInterstate = invoice.taxType === 'INTERSTATE';

      // Determine effective GST rate from items
      const sampleGstRate = invoice.items && invoice.items.length > 0 && invoice.items[0].gstRateSnapshot !== undefined
        ? Number(invoice.items[0].gstRateSnapshot)
        : 0;
      const formattedRate = sampleGstRate.toFixed(1).replace(/\.0$/, '');
      const halfRate = (sampleGstRate / 2).toFixed(1).replace(/\.0$/, '');

      // Calculate total quantity across items
      const totalQty = (invoice.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
      const totalItems = (invoice.items || []).length;

      // Count tax rows
      let taxRowsCount = 1; // Taxable Total
      if (isInterstate) {
        taxRowsCount += 1; // IGST
      } else {
        taxRowsCount += 2; // CGST + SGST
      }
      if (Number(invoice.roundOff || 0) !== 0) {
        taxRowsCount += 1;
      }

      const subtotalsHeight = taxRowsCount * 15 + 8;

      // Subtotals card (Full width)
      doc.rect(36, y, contentWidth, subtotalsHeight).fill('#ffffff');
      doc.rect(36, y, contentWidth, subtotalsHeight).stroke('#e2e8f0');

      // Left metadata inside subtotals: Total Items & Total Quantity
      doc.fillColor('#64748b').font('Helvetica').fontSize(8);
      doc.text(`Total Items: ${totalItems} | Total Quantity: ${totalQty}`, 48, y + 8);

      let ty = y + 7;
      const addTotalRow = (label, val, bold = false) => {
        doc.fillColor(bold ? '#0f172a' : '#475569')
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 9 : 8.5);
        doc.text(label, 330, ty, { width: 100, align: 'right' });
        doc.text(`Rs. ${val}`, 435, ty, { width: 115, align: 'right' });
        ty += 15;
      };

      addTotalRow('Taxable Total:', Number(invoice.taxableTotal || 0).toFixed(2));

      if (isInterstate) {
        const igstLabel = Number(formattedRate) > 0 ? `IGST @ ${formattedRate}%:` : 'IGST:';
        addTotalRow(igstLabel, Number(invoice.igstTotal || 0).toFixed(2));
      } else {
        const cgstLabel = Number(halfRate) > 0 ? `CGST @ ${halfRate}%:` : 'CGST:';
        const sgstLabel = Number(halfRate) > 0 ? `SGST @ ${halfRate}%:` : 'SGST:';
        addTotalRow(cgstLabel, Number(invoice.cgstTotal || 0).toFixed(2));
        addTotalRow(sgstLabel, Number(invoice.sgstTotal || 0).toFixed(2));
      }

      if (Number(invoice.roundOff || 0) !== 0) {
        addTotalRow('Round Off:', Number(invoice.roundOff).toFixed(2));
      }

      y += subtotalsHeight;

      // Grand Bill Amount Bar - FULL RECTANGLE SPANNING FULL WIDTH
      const grandTotalBarHeight = 32;
      doc.rect(36, y, contentWidth, grandTotalBarHeight).fill('#0f172a');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
      doc.text('GRAND TOTAL (INCL. GST):', 48, y + 10);
      doc.fillColor('#38bdf8').fontSize(13);
      doc.text(`Rs. ${Number(invoice.billAmount || 0).toFixed(2)}`, 350, y + 9, { width: 200, align: 'right' });

      y += grandTotalBarHeight;

      // ==========================================
      // 5. AMOUNT IN WORDS
      // ==========================================
      y += 6;
      doc.rect(36, y, contentWidth, 22).fill('#f8fafc');
      doc.rect(36, y, contentWidth, 22).stroke('#e2e8f0');

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      doc.text('Amount in Words:', 46, y + 6);
      doc.fillColor('#334155').font('Helvetica').fontSize(8);
      const amountWords = numberToIndianWords(invoice.billAmount || 0);
      doc.text(amountWords, 130, y + 6, { width: 420 });

      y += 22;

      // ==========================================
      // 6. TERMS & CONDITIONS (BOTH ENGLISH & GUJARATI BELOW)
      // ==========================================
      y += 8;
      const termsBoxHeight = 74;
      doc.rect(36, y, contentWidth, termsBoxHeight).fill('#f8fafc');
      doc.rect(36, y, contentWidth, termsBoxHeight).stroke('#e2e8f0');

      const colWidth = (contentWidth - 28) / 2; // ~247.64
      const leftColX = 46;
      const rightColX = 36 + (contentWidth / 2) + 8; // ~305.64

      // Middle vertical separator
      doc.strokeColor('#e2e8f0').lineWidth(0.8);
      doc.moveTo(36 + contentWidth / 2, y + 6).lineTo(36 + contentWidth / 2, y + termsBoxHeight - 6).stroke();

      // Clean English terms (strip duplicate headers and trailing signatures)
      const cleanEngTerms = (termsText || '')
        .replace(/^terms\s*(&|and)?\s*conditions:?\s*\n*/i, '')
        .replace(/\n\s*for,?\s+.*$/i, '')
        .trim();

      // Clean Gujarati terms (strip duplicate headers and trailing signatures)
      const cleanGujTerms = (termsGujarati || '')
        .replace(/^શરતો\s*અને\s*નિયમો:?\s*\n*/i, '')
        .replace(/\n\s*for,?\s+.*$/i, '')
        .trim();

      // --- Left Column: English Terms ---
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5);
      doc.text('TERMS & CONDITIONS:', leftColX, y + 7);
      doc.fillColor('#475569').font('Helvetica').fontSize(6.8);
      doc.text(cleanEngTerms, leftColX, y + 18, { width: colWidth - 8, lineGap: 2 });

      // --- Right Column: Gujarati Terms ---
      if (cleanGujTerms && hasGujaratiFont) {
        renderMixedText(doc, 'શરતો અને નિયમો:', rightColX, y + 7, colWidth - 8, 7.5, 2, true, '#0f172a');
        renderMixedText(doc, cleanGujTerms, rightColX, y + 18, colWidth - 8, 6.8, 2, false, '#475569');
      } else {
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5);
        doc.text('TERMS & CONDITIONS:', rightColX, y + 7);
        doc.fillColor('#475569').font('Helvetica').fontSize(6.8);
        doc.text(cleanEngTerms, rightColX, y + 18, { width: colWidth - 8, lineGap: 2 });
      }
      doc.font('Helvetica');

      y += termsBoxHeight;

      // ==========================================
      // 7. SIGNATURE SECTION (TWO-SIDED) & FOOTER
      // ==========================================
      const sigY = y + 14;
      const lineY = sigY + 42; // Generous space for physical signature and stamp

      // Left: Customer Signature
      doc.strokeColor('#cbd5e1').lineWidth(0.8);
      doc.moveTo(46, lineY).lineTo(180, lineY).stroke();
      doc.fillColor('#475569').font('Helvetica').fontSize(8);
      doc.text("Customer's Signature", 46, lineY + 4);

      // Right: For Company / Authorised Signatory
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
      doc.text(`For ${compName}`, 360, sigY, { width: 190, align: 'right' });
      doc.strokeColor('#cbd5e1').lineWidth(0.8);
      doc.moveTo(410, lineY).lineTo(550, lineY).stroke();
      doc.fillColor('#475569').font('Helvetica').fontSize(8);
      doc.text('Authorised Signatory', 360, lineY + 4, { width: 190, align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
