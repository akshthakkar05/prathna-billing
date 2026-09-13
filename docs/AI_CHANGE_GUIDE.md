# AI Coding Agent Change Guide

> **Quick Reference Cheat Sheet for Antigravity & AI Coding Assistants**  
> Before modifying any feature or business logic, consult this guide to understand which files to read and update.

---

## 1. Billing, GST Calculation & Invoice Math
**Before changing tax calculation, rounding, or line-item totals:**
- Read:
  - [`server/src/utils/billingMath.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/utils/billingMath.js) (Core `Prisma.Decimal` calculation engine: `calculateLineItem`, `calculateInvoiceTotals`)
  - [`server/src/utils/gstStates.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/utils/gstStates.js) (State resolution precedence and Intra/Inter-state tax type detection)
  - [`server/src/routes/invoices.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/routes/invoices.js) (Atomic stock decrement, transaction, snapshotting)
  - [`server/test/gstCalculation.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/gstCalculation.test.js) & [`server/test/calculations.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/calculations.test.js) (Regression test suite)

---

## 2. Invoicing, Sequential Numbering & Stock Decrement
**Before changing how sales invoices are saved or numbered:**
- Read:
  - [`server/src/utils/invoiceNumber.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/utils/invoiceNumber.js) (Atomic PostgreSQL row lock query `INSERT ... ON CONFLICT DO UPDATE RETURNING`)
  - [`server/src/routes/invoices.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/routes/invoices.js) (`POST /invoices` handler with atomic `updateMany` stock check)
  - [`server/prisma/schema.prisma`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/prisma/schema.prisma) (`Invoice`, `InvoiceItem`, `InvoiceCounter`, `StockTransaction`)
  - [`server/test/concurrency.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/concurrency.test.js)

---

## 3. Invoice PDF Generation, Layout & Typography
**Before changing the PDF invoice layout, fonts, header, or terms:**
- Read:
  - [`server/src/utils/pdfGenerator.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/utils/pdfGenerator.js) (`generateInvoicePDF`, `renderMixedText`, `numberToIndianWords`)
  - Font: [`server/assets/fonts/NotoSansGujarati-Regular.ttf`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/assets/fonts/NotoSansGujarati-Regular.ttf) (TrueType Unicode Gujarati font)
  - Logo path: [`server/assets/logo/`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/assets/logo/)
  - [`server/test/gujaratiPdf.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/gujaratiPdf.test.js)

---

## 4. Inventory, Purchases & Restocking
**Before changing stock behavior or inward purchases:**
- Read:
  - [`server/src/routes/purchases.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/routes/purchases.js) (Creates purchase, increments stock, writes `PURCHASE` transaction)
  - [`server/src/routes/products.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/routes/products.js) (Product creation & opening stock ledger)
  - [`server/prisma/schema.prisma`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/prisma/schema.prisma) (`Product`, `Purchase`, `PurchaseItem`, `StockTransaction`)
  - [`server/test/stockAndInvoice.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/stockAndInvoice.test.js)

---

## 5. Sales Returns & Refunds
**Before changing return quantities, restock logic, or refund math:**
- Read:
  - [`server/src/routes/invoices.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/routes/invoices.js) (`POST /invoices/:id/returns` with `SELECT ... FOR UPDATE` lock)
  - [`server/prisma/schema.prisma`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/prisma/schema.prisma) (`SalesReturn`, `SalesReturnItem`)
  - [`client/src/App.jsx`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/client/src/App.jsx) (`handleSubmitSalesReturn`, `openReturnModal`)
  - [`server/test/slice3.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/slice3.test.js) & [`server/test/concurrency.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/concurrency.test.js)

---

## 6. Authentication, Passwords & Route Security
**Before modifying auth, sessions, or route protection:**
- Read:
  - [`server/src/middleware/auth.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/middleware/auth.js) (`requireAuth`, `enforcePasswordChange`, production startup guard)
  - [`server/src/routes/auth.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/routes/auth.js) (`/login`, `/register`, `/change-password`, `/status`)
  - [`client/src/App.jsx`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/client/src/App.jsx) (`authFetch` token interceptor, login view, password change modal)
  - [`server/test/authEnforcement.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/authEnforcement.test.js)

---

## 7. Operational Dashboard & Sales Trend
**Before modifying dashboard cards, metrics, or the trend chart:**
- Read:
  - [`server/src/routes/dashboard.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/routes/dashboard.js) (`/summary` and `/sales-trend` date resolvers)
  - [`client/src/App.jsx`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/client/src/App.jsx) (Search for `activeTab === 'dashboard'`)
  - [`server/test/operationalDashboard.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/operationalDashboard.test.js)

---

## 8. Company Settings & Logo Uploads
**Before modifying store metadata, branding, or logo processing:**
- Read:
  - [`server/src/routes/settings.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/src/routes/settings.js) (`POST /settings`, `POST /settings/logo`, `DELETE /settings/logo`)
  - [`client/src/App.jsx`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/client/src/App.jsx) (`handleLogoFileChange`, `handleRemoveLogo`)
  - [`server/test/logo.test.js`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/test/logo.test.js)

---

## 9. Frontend Styling & Design System
**Before adjusting UI styling, colors, or responsiveness:**
- Read:
  - [`client/src/index.css`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/client/src/index.css) (The active Clean White POS Design System)
  - *Note:* Do not edit `client/src/App.css` (dead boilerplate file).

---

## 10. Database Schema Changes & Migrations
**Before modifying database tables or columns:**
1. Edit [`server/prisma/schema.prisma`](file:///c:/Users/Aksh/Documents/Client/prathna-billing/server/prisma/schema.prisma)
2. Generate client: `npm run db:generate --prefix server`
3. For local dev sync: `npm run db:push --prefix server`
4. For tracked migration: `npx prisma migrate dev --name <migration_name>` inside `server/`
5. Verify test suite: `npm test` inside `server/`
