# 🚀 Deployment Guide: Vercel (Frontend) + Render (Backend) + Supabase (PostgreSQL)

This guide walks you step-by-step through deploying the billing & inventory system with zero hassle.

---

## 📦 Architecture Overview
- **Database**: Supabase PostgreSQL (Managed cloud PostgreSQL database)
- **Backend API**: Render (Node.js Web Service running Express + Prisma)
- **Frontend SPA**: Vercel (React + Vite single page app with CDN & fast edge delivery)

---

## 🟢 Step 1: Set Up Supabase Database

1. Sign in to [Supabase](https://supabase.com/) and click **New Project**.
2. Set a Project Name (e.g. `prathna-billing`) and enter a strong **Database Password** (save this password).
3. Choose your region (e.g., `South Asia (Mumbai) - ap-south-1` for best latency in India).
4. Once the project is provisioned, go to **Project Settings** (gear icon) -> **Database** -> scroll down to **Connection string**:
   - Select **URI** tab.
   - Choose **Mode: Transaction** (Port `6543`) -> Copy this connection string. This is your `DATABASE_URL`.
     > Format: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
   - Choose **Mode: Session** (Port `5432`) -> Copy this connection string. This is your `DIRECT_URL`.
     > Format: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`

---

## 🟣 Step 2: Deploy Backend to Render

1. Push your repository to **GitHub**.
2. Sign in to [Render](https://render.com/) and click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service settings:
   - **Name**: `prathna-billing-backend` (or your preferred name)
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Region**: `Singapore` or `Frankfurt` (choose closest to Supabase)
   - **Branch**: `main`
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. In the **Environment Variables** section, add:
   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `5000` | Render port |
   | `DATABASE_URL` | *Your Supabase Transaction Pooler URI (Port 6543)* | From Step 1 |
   | `DIRECT_URL` | *Your Supabase Session Pooler URI (Port 5432)* | From Step 1 |
   | `JWT_SECRET` | `089441f64633038f3363fc0e185d30e6f1ea7d41f559af015b9af750a4bf208753091f9c4e1d65edc1fbc0a26f7d5d95e792cd5b73ddf44d81e6994c1ac7d1f4` | 512-bit JWT secret |
   | `CORS_ORIGIN` | `https://prathna-billing.vercel.app` | Vercel frontend domain |

6. Click **Create Web Service**.
7. Render will install dependencies, generate the Prisma client, and start the backend service.
8. Copy your live Render URL (e.g. `https://prathna-billing-backend.onrender.com`).

---

## ▲ Step 3: Deploy Frontend to Vercel

1. Sign in to [Vercel](https://vercel.com/) and click **Add New...** -> **Project**.
2. Import your GitHub repository.
3. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click **Edit** and select `client`
   - **Build Command**: `npm run build` (or leave default)
   - **Output Directory**: `dist` (default)
4. Under **Environment Variables**, add:
   | Key | Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://prathna-billing-backend.onrender.com` *(Your Render backend URL from Step 2, no trailing slash)* |

5. Click **Deploy**.
6. Once deployed, Vercel will provide your live URL (e.g. `https://prathna-billing.vercel.app`).

---

## 🔐 Step 4: First-Time Account Setup on Production

1. Open your live Vercel URL in your browser with the secret setup route:
   `https://your-app.vercel.app/#register`
2. Create your primary store admin account (e.g., `prijs24@gmail.com` / your chosen password).
3. Log in to open your billing counter.
4. Go to **Store & Invoice Settings** (`#settings`) to verify your company details (Prathna Enterprise, GSTIN, Address, Terms & Logo).

---

## 🛠️ Summary of Deployment Features Configured
- ✅ **Supabase Connection Pooling**: Configured dual `DATABASE_URL` (Port 6543 with PgBouncer) and `DIRECT_URL` (Port 5432) in `schema.prisma`.
- ✅ **Automatic Database Sync**: Build command `npm install && npx prisma generate && npx prisma db push` automatically synchronizes PostgreSQL schemas on every deploy.
- ✅ **Dynamic Cross-Origin Support**: Backend configured with flexible CORS supporting Vercel preview & production domains.
- ✅ **Vercel SPA Routing**: Added `client/vercel.json` with rewrite rules so direct URL routes and refreshes resolve seamlessly.
- ✅ **Dynamic API Resolution**: Frontend resolves all API requests, logo assets, and PDF downloads to `VITE_API_URL`.
