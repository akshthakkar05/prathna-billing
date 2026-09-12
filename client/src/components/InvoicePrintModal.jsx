import React from 'react';
import { X, Printer, Download } from 'lucide-react';

export default function InvoicePrintModal({ invoice, onClose }) {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const taxableTotal = Number(invoice.taxableTotal || 0);
  const cgstTotal = Number(invoice.cgstTotal || 0);
  const sgstTotal = Number(invoice.sgstTotal || 0);
  const roundOff = Number(invoice.roundOff || 0);
  const billAmount = Number(invoice.billAmount || 0);

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '850px', background: '#ffffff', color: '#1e293b' }}>
        {/* Modal Controls (Hidden in Print) */}
        <div className="modal-header no-print" style={{ borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ color: '#0f172a' }}>GST Tax Invoice Preview</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn btn-emerald btn-sm" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF
            </button>
            <button className="modal-close" onClick={onClose} style={{ color: '#64748b' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Tax Invoice Container */}
        <div className="modal-body print-invoice-sheet" style={{ padding: '32px', fontFamily: 'Inter, sans-serif' }}>
          {/* Header */}
          <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>PRATHNA ENTERPRISES</h1>
              <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#475569' }}>
                Electricals, Hardware & Industrial Goods Wholesaler
              </p>
              <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#475569' }}>
                42, Industrial Estate, Phase-1, Ahmedabad, Gujarat - 380015
              </p>
              <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#0f172a', fontWeight: 600 }}>
                GSTIN: 24AAACP9988P1Z8 | State: Gujarat (24)
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'inline-block', padding: '4px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                TAX INVOICE
              </span>
              <h3 style={{ margin: '8px 0 2px', fontSize: '1.2rem', color: '#0f172a' }}>{invoice.invoiceNumber}</h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
                Date: {new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
              <p style={{ fontSize: '0.82rem', color: invoice.paymentStatus === 'PAID' ? '#16a34a' : '#e11d48', fontWeight: 600, margin: '4px 0 0' }}>
                Status: {invoice.paymentStatus} ({invoice.paymentMethod || 'CASH'})
              </p>
            </div>
          </div>

          {/* Bill To & Dispatch Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>Billed To:</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{invoice.customer?.name || 'Cash Customer'}</div>
              {invoice.customer?.mobile && (
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>Phone: {invoice.customer.mobile}</div>
              )}
              {invoice.customer?.address && (
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>Address: {invoice.customer.address}</div>
              )}
              {invoice.customer?.gstin ? (
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                  GSTIN: {invoice.customer.gstin}
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Unregistered Consumer</div>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>Place of Supply:</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>Gujarat (24)</div>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '4px' }}>Reverse Charge: No</div>
              <div style={{ fontSize: '0.82rem', color: '#475569' }}>Payment Mode: {invoice.paymentMethod || 'CASH'}</div>
            </div>
          </div>

          {/* Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                <th style={{ padding: '8px', width: '30px' }}>#</th>
                <th style={{ padding: '8px' }}>Description of Goods</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>HSN</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Qty</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Rate (₹)</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Taxable (₹)</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>CGST</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>SGST</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', color: '#64748b' }}>{idx + 1}</td>
                  <td style={{ padding: '8px', fontWeight: 600, color: '#0f172a' }}>
                    {item.descriptionSnapshot}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{item.hsnSnapshot}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{Number(item.qty).toFixed(0)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Number(item.rate).toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Number(item.taxableValue).toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    ₹{Number(item.cgstAmount).toFixed(2)}
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{(Number(item.gstRateSnapshot) / 2).toFixed(1)}%</div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    ₹{Number(item.sgstAmount).toFixed(2)}
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{(Number(item.gstRateSnapshot) / 2).toFixed(1)}%</div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                    {Number(item.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals & Tax Summary Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', borderTop: '1px solid #cbd5e1', paddingTop: '16px' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Bank Details for RTGS/NEFT:</div>
              <div>Bank: HDFC Bank Ltd.</div>
              <div>Account Name: Prathna Enterprises</div>
              <div>A/c No: 50200012345678</div>
              <div>IFSC Code: HDFC0001234</div>
              <div style={{ marginTop: '8px', fontStyle: 'italic' }}>
                Note: Goods once sold will not be taken back or exchanged. Subject to Ahmedabad jurisdiction.
              </div>
            </div>

            <div style={{ fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Total Taxable Value:</span>
                <span style={{ fontWeight: 600 }}>₹{taxableTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Total CGST:</span>
                <span style={{ fontWeight: 600 }}>₹{cgstTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#64748b' }}>Total SGST:</span>
                <span style={{ fontWeight: 600 }}>₹{sgstTotal.toFixed(2)}</span>
              </div>
              {roundOff !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#64748b' }}>Round Off:</span>
                  <span style={{ fontWeight: 600 }}>₹{roundOff.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #0f172a', marginTop: '6px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                <span>Grand Total:</span>
                <span>₹{billAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '40px', paddingTop: '20px' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              This is a computer-generated tax invoice.
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ height: '45px' }}></div>
              <div style={{ borderTop: '1px dashed #94a3b8', width: '200px', paddingTop: '4px', fontSize: '0.78rem', fontWeight: 600, color: '#0f172a' }}>
                For Prathna Enterprises
                <div style={{ fontWeight: 400, color: '#64748b', fontSize: '0.72rem' }}>Authorized Signatory</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
