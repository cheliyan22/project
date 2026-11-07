import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    // Project tests only. `vendor-reference/` holds the audited third-party
    // repositories read-only: they are not installed, not compiled and not ours
    // to pass, and letting vitest collect them turns every run red on import
    // errors that say nothing about this app.
    include: ['src/**/*.test.{ts,tsx}', 'supabase/**/*.test.ts'],
  },
});
