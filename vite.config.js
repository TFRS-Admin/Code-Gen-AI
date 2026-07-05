import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// WebContainers needs SharedArrayBuffer, which browsers only expose on
// cross-origin-isolated pages. COEP is set to "credentialless" (rather than
// "require-corp") so the rest of the app's cross-origin embeds (Stripe.js,
// fonts, etc.) keep working without every one of them needing a matching
// CORP header. Mirrored in ./Caddyfile for the production static build.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
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
