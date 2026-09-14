# Prathna Billing & Inventory Management System

A full-stack Point of Sale (POS), GST invoicing, purchase tracking, and inventory management application tailored for **Prathna Enterprise** (Ahmedabad, Gujarat).

---

## ⚡ Tech Stack

- **Frontend:** React, Vite, TailwindCSS, Lucide Icons
- **Backend:** Node.js, Express.js, Prisma ORM
- **Database:** PostgreSQL (Supabase with connection pooling)
- **PDF Generation:** PDFKit with Gujarati font support (`NotoSansGujarati`)
- **Hosting:** Vercel (Frontend) & Render (Backend)

---

## 🚀 Key Features

- **GST Tax Invoicing:** Dynamic Indian Financial Year serial numbering (`INV/26-27/1001`), auto intra-state (CGST + SGST 9%+9%) vs inter-state (IGST 18%) calculation.
- **Bilingual Invoices:** Professional A4 GST tax invoices with terms in English & Gujarati.
- **Inventory & Stock Tracking:** Real-time stock decrement, low-stock warnings, and transaction logs.
- **Customer & Supplier Management:** Quick customer lookup, GSTIN validation, and purchase tracking.
- **Sales Returns:** Line-item return tracking with automatic stock restoration.
- **Reports & Analytics:** Daily, monthly, and yearly revenue graphs, GST tax breakdown summaries, and top-selling products.

---

## 🛠️ Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Servers
Runs both Vite frontend (`http://localhost:5173`) and Express backend (`http://localhost:5000`):
```bash
npm run dev
```

---

## 🌐 Production Links

- **Live Application:** [https://prathna-billing.vercel.app](https://prathna-billing.vercel.app)
- **Backend API:** [https://prathna-billing.onrender.com](https://prathna-billing.onrender.com)

---

## 📖 Additional Docs
For detailed deployment instructions and architecture notes, see [`instructions.md`](./instructions.md).
