/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works on GitHub Pages (/<repo>/) and any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: { main: 'index.html', classic: 'classic.html' },
    },
  },
  worker: { format: 'es' },
})
