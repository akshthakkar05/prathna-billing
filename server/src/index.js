import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import productsRouter from "./routes/products.js";
import customersRouter from "./routes/customers.js";
import invoicesRouter from "./routes/invoices.js";
import suppliersRouter from "./routes/suppliers.js";
import purchasesRouter from "./routes/purchases.js";
import settingsRouter from "./routes/settings.js";
import dashboardRouter from "./routes/dashboard.js";
import reportsRouter from "./routes/reports.js";
import stockRouter from "./routes/stock.js";

import authRouter from "./routes/auth.js";
import { requireAuth, enforcePasswordChange } from "./middleware/auth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.resolve(__dirname, "../assets");

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
// Dynamic CORS to support Vercel deployments, custom domains, and local dev
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["*"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Public Static Assets (Logos, fonts, etc. - unauthenticated)
app.use("/assets", express.static(assetsDir));
app.use("/api/assets", express.static(assetsDir));

// Root and health check (public)
app.get("/", (req, res) =>
  res.json({
    status: "ok",
    service: "Prathna Billing API",
    docs: "/health",
    message: "Welcome to Prathna Billing API",
  }),
);
app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "Billing V1, V2, V3 & Auth V4" }),
);
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "Billing V1, V2, V3 & Auth V4" }),
);

// Auth Routes (public)
app.use("/auth", authRouter);
app.use("/api/auth", authRouter);

// Protected Routes (Slice 1-3)
// All protected routes run requireAuth then enforcePasswordChange.
// enforcePasswordChange blocks requests when mustChangePassword=true EXCEPT
// for /auth/change-password which is explicitly exempted inside the middleware.

// Products
app.use("/products", requireAuth, enforcePasswordChange, productsRouter);
app.use("/api/products", requireAuth, enforcePasswordChange, productsRouter);

// Customers
app.use("/customers", requireAuth, enforcePasswordChange, customersRouter);
app.use("/api/customers", requireAuth, enforcePasswordChange, customersRouter);

// Invoices (including /invoices/:id/returns and /invoices/:id/pdf)
app.use("/invoices", requireAuth, enforcePasswordChange, invoicesRouter);
app.use("/api/invoices", requireAuth, enforcePasswordChange, invoicesRouter);

// Suppliers (Slice 2)
app.use("/suppliers", requireAuth, enforcePasswordChange, suppliersRouter);
app.use("/api/suppliers", requireAuth, enforcePasswordChange, suppliersRouter);

// Purchases (Slice 2)
app.use("/purchases", requireAuth, enforcePasswordChange, purchasesRouter);
app.use("/api/purchases", requireAuth, enforcePasswordChange, purchasesRouter);

// Company Settings (Slice 2)
app.use("/settings", requireAuth, enforcePasswordChange, settingsRouter);
app.use("/api/settings", requireAuth, enforcePasswordChange, settingsRouter);

// Dashboard (Slice 3)
app.use("/dashboard", requireAuth, enforcePasswordChange, dashboardRouter);
app.use("/api/dashboard", requireAuth, enforcePasswordChange, dashboardRouter);

// Reports (Slice 3)
app.use("/reports", requireAuth, enforcePasswordChange, reportsRouter);
app.use("/api/reports", requireAuth, enforcePasswordChange, reportsRouter);

// Stock Transactions & Adjustments
app.use("/stock", requireAuth, enforcePasswordChange, stockRouter);
app.use("/api/stock", requireAuth, enforcePasswordChange, stockRouter);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Billing Server running on port ${PORT}`);
  });
}

export default app;
