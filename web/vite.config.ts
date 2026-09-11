import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The local chat engine runs on :8000. The frontend calls /api/* and
// this proxy forwards to it, stripping the /api prefix.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // TWIN_ENGINE_URL points the dev proxy at a second engine, which is
        // handy when one is already running on the default port.
        target: process.env.TWIN_ENGINE_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
