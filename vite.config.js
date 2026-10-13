import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so a build works from any folder or sub-path (e.g. GitHub Pages).
  base: './',
  // Port 8080 on purpose: invoices, clients and your details live in the browser's
  // localStorage, which is tied to the exact address. Keeping localhost:8080 keeps that data.
  server: { port: 8080, strictPort: true, open: true },
  preview: { port: 8080, strictPort: true, open: true },
  // These load on demand (first PDF download, first QR upload, signing in). Preparing them up
  // front stops the dev server from reloading the page the first time they're needed.
  optimizeDeps: { include: ['html2canvas', 'jspdf', 'jsqr', 'qrcode-generator', 'idb-keyval', 'firebase/app', 'firebase/auth', 'firebase/firestore'] },
  // Firebase (~550 kB, ~165 kB compressed) is one chunk loaded only when you sign in.
  build: { chunkSizeWarningLimit: 600 },
  // Unit tests only; the browser tests in tests/e2e run through Playwright.
  test: { include: ['tests/unit/**/*.test.js'] },
});
