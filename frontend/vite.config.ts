import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
  },
  preview: {
    // Render sets RENDER_EXTERNAL_HOSTNAME (e.g. s-care-web.onrender.com) on web services
    allowedHosts: process.env.RENDER_EXTERNAL_HOSTNAME
      ? [process.env.RENDER_EXTERNAL_HOSTNAME]
      : [],
  }
})
