import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev server settings optimized for Tauri on Windows.
// The ignored list prevents Vite from watching Rust build outputs that Windows locks during Cargo builds.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    minify: 'oxc',
    cssMinify: true,
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }
          if (id.includes('node_modules/monaco-editor') || id.includes('@monaco-editor')) {
            return 'monaco';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/src-tauri/target/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
