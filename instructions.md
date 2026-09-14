# Prathna Enterprise Billing System — Project Documentation & Instructions

> [!CAUTION]
> ### 🛑 STRICT PRODUCTION DATABASE LOCK RULE
> **This database is actively used in PRODUCTION.**
> - **DO NOT do any modifications to the database.**
> - **DO NOT add or delete data from the database.**
> - **NEVER** run `prisma migrate reset`, `prisma db push --force-reset`, or any destructive database scripts.
> - **NEVER** execute test seed scripts (`seed.js`) against the production database.
> - **NEVER** drop tables, delete records, truncate, or wipe any customer, invoice, product, or supplier data.
> - All live data belongs to real business transactions and must remain intact at all times.

---

## 🏛️ System Architecture

| Component | Platform | Primary URL / Host | Description |
| :--- | :--- | :--- | :--- |
| **Frontend** | **Vercel** | [https://prathna-billing.vercel.app](https://prathna-billing.vercel.app) | React + Vite Single Page Application |
| **Backend API** | **Render** | [https://prathna-billing.onrender.com](https://prathna-billing.onrender.com) | Node.js + Express + Prisma ORM |
| **Database** | **Supabase** | `aws-0-ap-northeast-1.pooler.supabase.com` | Hosted PostgreSQL with PgBouncer Pooling |

---

## 🚀 Running Locally for Development

### 1. Prerequisites
- **Node.js**: v18 or higher (v20+ recommended)
- **npm**: v9+

### 2. Start Both Frontend & Backend
From the root repository directory:

```bash
# 1. Install all dependencies
npm install

# 2. Start concurrent dev servers (Frontend: 5173, Backend: 5000)
npm run dev
```

- **Local Frontend**: `http://localhost:5173/`
- **Local Backend**: `http://localhost:5000/`

---

## 🔄 Deployment Workflow

Continuous deployment is enabled via **GitHub (`main` branch)**:

1. **Commit and push changes**:
   ```bash
   git add .
   git commit -m "your descriptive commit message"
   git push origin main
   ```
2. **Automated Deployments**:
   - **Render**: Automatically pulls `main`, installs packages, runs `prisma generate`, and restarts the server with zero downtime.
   - **Vercel**: Automatically compiles Vite production bundle and deploys to `https://prathna-billing.vercel.app`.

---

## 🔑 Environment Variables Reference

### Backend (`server/.env` & Render Dashboard)

```env
PORT=5000
NODE_ENV=production
DATABASE_URL="postgresql://postgres.aropeqsqfwbrhyfyeekw:prathna-enterprise@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=15&pool_timeout=20"
DIRECT_URL="postgresql://postgres.aropeqsqfwbrhyfyeekw:prathna-enterprise@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
JWT_SECRET="089441f64633038f3363fc0e185d30e6f1ea7d41f559af015b9af750a4bf208753091f9c4e1d65edc1fbc0a26f7d5d95e792cd5b73ddf44d81e6994c1ac7d1f4"
CORS_ORIGIN="https://prathna-billing.vercel.app"
```

### Frontend (`client/.env` & Vercel Dashboard)

```env
VITE_API_URL=https://prathna-billing.onrender.com
```

---

## 🛡️ Best Practices & Maintenance

1. **Database Schema Changes**:
   - When modifying `schema.prisma`, always test additions locally before pushing.
   - Use additive fields (e.g. optional fields with default values) to prevent breaking existing data.
2. **Cold Starts (Render Free Tier)**:
   - Render spins down inactive backend instances after 15 minutes of idle time.
   - The first request after a cold period takes ~20 seconds to wake up; subsequent requests respond in under 300ms.
3. **Daily Login Session**:
   - Staff/admin sessions are authenticated with JSON Web Tokens (JWT) requiring 1 login per day.
4. **GST Invoice Numbering**:
   - Invoices are dynamically generated as `INV/<FY>/<Sequence>` (e.g. `INV/26-27/1001`, `INV/26-27/1002`).
   - The Financial Year is calculated dynamically from the invoice date (April 1st to March 31st).
   - Fully compliant with Rule 46(b) of the CGST Rules (14 characters, letters/digits/hyphens/slashes).
