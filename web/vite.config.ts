import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The engine (FastAPI) runs on :8000 in dev. The frontend calls /api/* and
// this proxy forwards to it, stripping the /api prefix.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
