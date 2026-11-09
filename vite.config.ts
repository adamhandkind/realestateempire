import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev:api` runs the Worker on 8787. Without it, /api gets no
    // answer and the game falls back to local single-player play.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
