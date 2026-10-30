import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from a tablet on the same Wi-Fi
    proxy: {
      // Local helper (Python/FastAPI): song import, stems, library.
      '/api': `http://127.0.0.1:${process.env.BASSHOPPER_PORT || 8765}`,
    },
  },
})
