import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // The server/ package has its own node:test suite (run via `npm test`
    // inside server/) — keep it out of the frontend Vitest run.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  },
})
