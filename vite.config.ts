import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    // Pixel-font subsets must remain files under the app's font-src 'self' policy.
    assetsInlineLimit: 0,
  },
});

