import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:5000',
      '/products': 'http://localhost:5000',
      '/customers': 'http://localhost:5000',
      '/invoices': 'http://localhost:5000',
      '/suppliers': 'http://localhost:5000',
      '/purchases': 'http://localhost:5000',
      '/settings': 'http://localhost:5000',
      '/dashboard': 'http://localhost:5000',
      '/reports': 'http://localhost:5000',
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
