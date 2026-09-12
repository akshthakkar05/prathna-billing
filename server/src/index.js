import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import productsRouter from './routes/products.js';
import customersRouter from './routes/customers.js';
import invoicesRouter from './routes/invoices.js';
import suppliersRouter from './routes/suppliers.js';
import purchasesRouter from './routes/purchases.js';
import settingsRouter from './routes/settings.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Billing V1 & V2' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Billing V1 & V2' }));

// Express routes:
// Products
app.use('/products', productsRouter);
app.use('/api/products', productsRouter);

// Customers
app.use('/customers', customersRouter);
app.use('/api/customers', customersRouter);

// Invoices (including /invoices/:id/pdf)
app.use('/invoices', invoicesRouter);
app.use('/api/invoices', invoicesRouter);

// Suppliers (Slice 2)
app.use('/suppliers', suppliersRouter);
app.use('/api/suppliers', suppliersRouter);

// Purchases (Slice 2)
app.use('/purchases', purchasesRouter);
app.use('/api/purchases', purchasesRouter);

// Company Settings (Slice 2)
app.use('/settings', settingsRouter);
app.use('/api/settings', settingsRouter);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Billing Server running on http://localhost:${PORT}`);
});

export default app;
